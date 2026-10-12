terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.15"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source = "./modules/vpc"
  environment = var.environment
}

module "ecs" {
  source = "./modules/ecs"
  environment = var.environment
  vpc_id = module.vpc.vpc_id
}

module "elasticache" {
  source = "./modules/elasticache"
  environment = var.environment
  vpc_id = module.vpc.vpc_id
}

module "mongodb_atlas" {
  source = "./modules/mongodb-atlas"
  environment = var.environment
}

module "autoscaling" {
  source = "./modules/autoscaling"
  cluster_name = module.ecs.cluster_name
  service_name = module.ecs.service_name
}
