# Scheduled Pre-warm Autoscaling Policy for ECS Fargate
# Scales up tasks in advance of scheduled event check-in surges to prevent reactive lag.

variable "cluster_name" { type = string }
variable "service_name" { type = string }

resource "aws_appautoscaling_target" "ecs_target" {
  max_capacity       = 50
  min_capacity       = 2
  resource_id        = "service/${var.cluster_name}/${var.service_name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_scheduled_action" "pre_warm_event_start" {
  name               = "pre-warm-event-start"
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  schedule           = "cron(0 7 * * ? *)" # Example morning pre-warm or dynamically dispatched

  scalable_target_action {
    min_capacity = 10
    max_capacity = 50
  }
}
