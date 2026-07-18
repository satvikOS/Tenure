# ── Scheduled jobs ────────────────────────────────────────────────────────────
#
# Deliverable reminders must fire whether or not anyone opens the app: missing
# an audit or an evaluation deadline freezes a club's budget. EventBridge
# Scheduler calls the job endpoint directly through the ALB.
#
# The endpoint is idempotent (one DeliverableReminder row per person per
# deliverable), so a retry or an overlapping invocation cannot double-notify.

# Shared secret the scheduler presents as a bearer token.
resource "random_password" "job_secret" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "job" {
  name                    = "${local.name_prefix}/job"
  description             = "Bearer token for scheduled job endpoints"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "job" {
  secret_id     = aws_secretsmanager_secret.job.id
  secret_string = jsonencode({ JOB_SECRET = random_password.job_secret.result })
}

# ── IAM: let the scheduler invoke the endpoint via an API destination ─────────
resource "aws_iam_role" "scheduler" {
  name = "${local.name_prefix}-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
      }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name = "${local.name_prefix}-scheduler-invoke"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["events:InvokeApiDestination"]
        Resource = aws_cloudwatch_event_api_destination.reminders.arn
      },
    ]
  })
}

# ── Connection + destination ─────────────────────────────────────────────────
resource "aws_cloudwatch_event_connection" "job" {
  name               = "${local.name_prefix}-job"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key   = "Authorization"
      value = "Bearer ${random_password.job_secret.result}"
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "reminders" {
  name                             = "${local.name_prefix}-reminders"
  invocation_endpoint              = "http://${aws_lb.main.dns_name}/api/jobs/reminders"
  http_method                      = "POST"
  invocation_rate_limit_per_second = 1
  connection_arn                   = aws_cloudwatch_event_connection.job.arn
}

# ── Schedule ─────────────────────────────────────────────────────────────────
#
# 13:00 UTC ≈ 8–9am Eastern. Deliverables are stored at noon UTC on their due
# date, so a run at 13:00 the day before sits inside the endpoint's 24-hour
# look-ahead window and gives boards a full working day of notice.
resource "aws_scheduler_schedule" "deliverable_reminders" {
  name       = "${local.name_prefix}-deliverable-reminders"
  group_name = "default"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = "cron(0 13 * * ? *)"
  schedule_expression_timezone = "UTC"

  target {
    arn      = aws_cloudwatch_event_api_destination.reminders.arn
    role_arn = aws_iam_role.scheduler.arn

    retry_policy {
      maximum_retry_attempts       = 3
      maximum_event_age_in_seconds = 3600
    }
  }
}
