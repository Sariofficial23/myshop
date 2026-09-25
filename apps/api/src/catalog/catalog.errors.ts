import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@myshop/shared';
import { AppException } from '../common/errors/app.exception.js';

export const notFound = (code: ErrorCode, message: string) =>
  new AppException(code, HttpStatus.NOT_FOUND, message);

export const productNotFound = () => notFound(ErrorCode.PRODUCT_NOT_FOUND, 'Product not found');
export const variantNotFound = () => notFound(ErrorCode.VARIANT_NOT_FOUND, 'Variant not found');
export const categoryNotFound = () => notFound(ErrorCode.CATEGORY_NOT_FOUND, 'Category not found');
export const brandNotFound = () => notFound(ErrorCode.BRAND_NOT_FOUND, 'Brand not found');
