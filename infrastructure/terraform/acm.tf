# ── Custom domain certificate (app.tenurework.com) ───────────────────────────
# Two-phase: the cert is requested here and must be validated by adding a
# CNAME at the domain registrar; once ISSUED, set attach_custom_domain=true
# to bind it to CloudFront.
resource "aws_acm_certificate" "custom" {
  count             = var.custom_domain != "" ? 1 : 0
  domain_name       = var.custom_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "${local.name_prefix}-custom-domain" }
}

output "acm_validation_records" {
  description = "Add these CNAMEs at the registrar to validate the certificate"
  value = var.custom_domain != "" ? [
    for o in aws_acm_certificate.custom[0].domain_validation_options : {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ] : []
}

output "custom_domain_cname_target" {
  description = "Point the app subdomain CNAME at this"
  value       = aws_cloudfront_distribution.main.domain_name
}
