import { Module } from '@nestjs/common';
import { BrandsService } from './brands.service.js';
import {
  BrandsController,
  CategoriesController,
  ProductsController,
  SerialNumbersController,
} from './catalog.controllers.js';
import { CategoriesService } from './categories.service.js';
import { ProductsService } from './products.service.js';
import { SerialNumbersService } from './serial-numbers.service.js';

@Module({
  controllers: [
    CategoriesController,
    BrandsController,
    ProductsController,
    SerialNumbersController,
  ],
  providers: [CategoriesService, BrandsService, ProductsService, SerialNumbersService],
  exports: [ProductsService, SerialNumbersService],
})
export class CatalogModule {}
