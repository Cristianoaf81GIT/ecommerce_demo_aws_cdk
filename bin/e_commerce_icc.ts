#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductsFunctionStack } from '../lib/productsFunction-stack';
import { EcommerceApiStack } from '../lib/ecommerceApi-stack';
import { ProductsDdbStack } from '../lib/productsDdb-stack';
import * as dotenv from 'dotenv';

dotenv.config()

const app = new cdk.App();

const env : cdk.Environment = {
  account: process.env.AWS_ACCOUNT_ID,
  region: process.env.AWS_ACCOUNT_REGION, 
}


const productsDdbStack = new ProductsDdbStack(app, 'ProductsDdb', {
  env: env
})

const productFunctionStack = new ProductsFunctionStack(app,"ProductsFunction", {
  env: env,
  productsDdb: productsDdbStack.table
});

// força dependência entre a stack de produto de banco dinamo
productFunctionStack.addDependency(productsDdbStack);

const eCommerceApiStack = new EcommerceApiStack(app, "EcommerceAPI", {
  productsHandler: productFunctionStack.handler,
  env: env
});

// força order no deploy das stacks
eCommerceApiStack.addDependency(productFunctionStack);

