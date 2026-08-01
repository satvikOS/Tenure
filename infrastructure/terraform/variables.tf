variable "project" {
  description = "Project name used in all resource names"
  type        = string
  default     = "tenure"
}

variable "environment" {
  description = "Deployment environment (pilot | staging | production)"
  type        = string
  default     = "pilot"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

# ── App image ────────────────────────────────────────────────────────────────
variable "image_tag" {
  description = "Docker image tag to deploy (git SHA or 'latest')"
  type        = string
  default     = "latest"
}

# ── Networking ───────────────────────────────────────────────────────────────
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "availability_zones" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}

# ── RDS ─────────────────────────────────────────────────────────────────────
variable "rds_instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "rds_allocated_storage" {
  type    = number
  default = 20
}

variable "rds_db_name" {
  type    = string
  default = "tenure"
}

variable "rds_username" {
  type    = string
  default = "tenure_admin"
}

# ── ElastiCache ──────────────────────────────────────────────────────────────
variable "redis_node_type" {
  type    = string
  default = "cache.t3.micro"
}

# ── ECS ──────────────────────────────────────────────────────────────────────
variable "ecs_cpu" {
  type    = number
  default = 512 # 0.5 vCPU — the app outgrew 256 (health probes starved)
}

variable "ecs_memory" {
  type    = number
  default = 1024
}

variable "ecs_desired_count" {
  type    = number
  default = 1
}

# ── Domain / Auth ─────────────────────────────────────────────────────────────
variable "auth_secret" {
  description = "NextAuth AUTH_SECRET — injected via Secrets Manager after initial deploy"
  type        = string
  default     = ""
  sensitive   = true
}

variable "okta_client_id" {
  type      = string
  default   = ""
  sensitive = true
}

variable "okta_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "okta_issuer" {
  type    = string
  default = ""
}

variable "ses_from_email" {
  description = "Verified SES sender address"
  type        = string
  default     = "hello@tenurework.com"
}

variable "anthropic_api_key" {
  description = "Optional — enables AI answer synthesis on /search when set"
  type        = string
  default     = ""
  sensitive   = true
}

variable "custom_domain" {
  description = "Custom domain for the app (empty disables)"
  type        = string
  # `platform` rather than `app`: tenurework.com and www.tenurework.com serve the
  # marketing site from Vercel, and the product needed a subdomain that reads as
  # the place where the work happens. Changing this forces replacement of
  # aws_acm_certificate.custom — a certificate's domain_name cannot be edited in
  # place — so the previously requested, never-validated app.tenurework.com cert
  # is destroyed and a new one requested. create_before_destroy keeps the swap
  # safe if the domain is ever changed again while attached.
  default = "platform.tenurework.com"
}

variable "attach_custom_domain" {
  description = "Bind the custom domain to CloudFront — only after the ACM cert is ISSUED"
  type        = bool
  # Enabled 2026-07-30: the certificate for platform.tenurework.com reached
  # ISSUED (validation SUCCESS, SAN platform.tenurework.com, expires
  # 2027-02-12) once a CAA record authorising amazon.com was published. The two
  # earlier requests ended in CAA_ERROR because tenurework.com permitted only
  # letsencrypt.org, pki.goog and sectigo.com.
  #
  # This flips three things at once, by design: the CloudFront alias and viewer
  # certificate (cloudfront.tf), NEXTAUTH_URL (ecs.tf) and the EventBridge
  # reminder destination (scheduler.tf). Auth would break on the branded host if
  # the first moved without the second, so they must not be split.
  default = true
}

variable "platform_reconcile_secret" {
  description = <<-EOT
    Bearer token the Tenure engine presents when delivering a signed deployment
    manifest to this cell.

    The identical value must be configured on the engine. It authenticates the
    caller; the artifact's own digest authenticates the content, and neither
    substitutes for the other — a stolen token still cannot make this cell apply
    an altered manifest, because the digest is recomputed here before any row is
    written.

    Empty means this cell accepts no deployments: the endpoint returns 503 and
    names the variable, rather than 401-ing as though the caller were at fault.
  EOT
  type        = string
  default     = ""
  sensitive   = true
}
