# Isolated ElastiCache Redis Clusters
# Three distinct clusters: 1. Cache & Sessions, 2. Chat Pub/Sub, 3. BullMQ Queue

variable "environment" { type = string }
variable "vpc_id" { type = string }

# 1. Cache & Sessions
resource "aws_elasticache_cluster" "redis_cache" {
  cluster_id           = "tbi-${var.environment}-cache"
  engine               = "redis"
  node_type            = "cache.t4g.medium"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
}

# 2. Chat Pub/Sub
resource "aws_elasticache_cluster" "redis_pubsub" {
  cluster_id           = "tbi-${var.environment}-pubsub"
  engine               = "redis"
  node_type            = "cache.t4g.medium"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6380
}

# 3. BullMQ Job Queue
resource "aws_elasticache_cluster" "redis_queue" {
  cluster_id           = "tbi-${var.environment}-queue"
  engine               = "redis"
  node_type            = "cache.t4g.medium"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6381
}
