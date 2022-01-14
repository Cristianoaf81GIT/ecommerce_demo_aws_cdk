#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductsFunctionStack } from '../lib/productsFunction-stack';
import { EcommerceApiStack } from '../lib/ecommerceApi-stack';
import { ProductsDdbStack } from '../lib/productsDdb-stack';
import { EventsDdbStack } from '../lib/eventsDdb-stack';
import { OrdersApplicationStack } from '../lib/ordersApplication-stack';
import { InvoiceWSApiStack } from '../lib/invoiceWSApi-stack';
import { InvoiceAppLayersStack } from '../lib/invoiceAppLayers-stack';
import * as dotenv from 'dotenv';

dotenv.config()

const app = new cdk.App();

const env : cdk.Environment = {
  account: process.env.AWS_ACCOUNT_ID,
  region: process.env.AWS_ACCOUNT_REGION, 
};




const eventsDdbStack = new EventsDdbStack(app, 'EventsDdb', {
  env: env
});

const productsDdbStack = new ProductsDdbStack(app, 'ProductsDdb', {
  env: env
});

const invoiceAppLayersStack = new InvoiceAppLayersStack(app, "InvoiceAppLayers", {
  env: env
});

const productFunctionStack = new ProductsFunctionStack(app,"ProductsFunction", {
  env: env,
  productsDdb: productsDdbStack.table,
  eventsDdb: eventsDdbStack.table
});

const ordersApplicationStack = new OrdersApplicationStack(app, "OrdersApplication", {
  productsDdb: productsDdbStack.table,
  eventsDdb: eventsDdbStack.table,
  env: env
});

const invoiceWSApiStack = new InvoiceWSApiStack(app, 'InvoiceApi', {
  env: env,
  eventsDdb: eventsDdbStack.table
});

// força dependência entre a stack de produto de banco dinamo
productFunctionStack.addDependency(productsDdbStack);
productFunctionStack.addDependency(eventsDdbStack);
ordersApplicationStack.addDependency(productsDdbStack);
ordersApplicationStack.addDependency(eventsDdbStack);

const eCommerceApiStack = new EcommerceApiStack(app, "EcommerceAPI", {
  productsHandler: productFunctionStack.productsHandler,
  ordersHandler: ordersApplicationStack.ordersHandler,
  orderEventsFetchHandler: ordersApplicationStack.orderEventsFetchHandler,
  env: env
});

// força order no deploy das stacks
eCommerceApiStack.addDependency(productFunctionStack);
eCommerceApiStack.addDependency(ordersApplicationStack);
invoiceWSApiStack.addDependency(invoiceAppLayersStack);
invoiceWSApiStack.addDependency(eventsDdbStack);

