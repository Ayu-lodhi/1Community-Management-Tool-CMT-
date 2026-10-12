# MongoDB Atlas Provisioning with Sharding Module for Write-Scaling

variable "environment" { type = string }

resource "mongodbatlas_cluster" "cluster" {
  project_id   = "dummy_project_id"
  name         = "tbi-${var.environment}-cluster"
  cluster_type = "SHARDED"

  replication_specs {
    num_shards = 2
    regions_config {
      region_name     = "AP_SOUTH_1"
      electable_nodes = 3
      priority        = 7
      read_only_nodes = 0
    }
  }

  provider_name               = "AWS"
  provider_instance_size_name = "M30"
}
