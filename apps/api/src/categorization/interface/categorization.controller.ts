import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import {
  OverrideMerchantCategory,
  type OverrideMerchantInput,
} from '../use-cases/override-merchant.use-case';
import {
  OverrideTransactionCategory,
  type OverrideTransactionInput,
} from '../use-cases/override-transaction.use-case';
import { CreateCategory, type CreateCategoryInput } from '../use-cases/create-category.use-case';
import { RenameCategory, type RenameCategoryInput } from '../use-cases/rename-category.use-case';
import { DeleteCategory, type DeleteCategoryInput } from '../use-cases/delete-category.use-case';
import { ListCategories } from '../use-cases/list-categories.use-case';
import {
  ProposeCategoryChange,
  type ProposeCategoryChangeInput,
} from '../use-cases/propose-category-change.use-case';
import {
  createCategoryInput,
  deleteCategoryInput,
  overrideMerchantInput,
  overrideTransactionInput,
  proposeCategoryChangeInput,
  renameCategoryInput,
} from './categorization.schemas';

@Controller('categorization')
export class CategorizationController {
  constructor(
    private readonly merchant: OverrideMerchantCategory,
    private readonly transaction: OverrideTransactionCategory,
    private readonly create: CreateCategory,
    private readonly rename: RenameCategory,
    private readonly del: DeleteCategory,
    private readonly list: ListCategories,
    private readonly propose: ProposeCategoryChange,
  ) {}

  @Post('merchant')
  overrideMerchant(@Body(new ZodValidationPipe(overrideMerchantInput)) body: OverrideMerchantInput) {
    return this.merchant.execute(body);
  }

  @Post('transaction')
  overrideTransaction(
    @Body(new ZodValidationPipe(overrideTransactionInput)) body: OverrideTransactionInput,
  ) {
    return this.transaction.execute(body);
  }

  @Post('create-category')
  createCategory(@Body(new ZodValidationPipe(createCategoryInput)) body: CreateCategoryInput) {
    return this.create.execute(body);
  }

  @Post('rename-category')
  renameCategory(@Body(new ZodValidationPipe(renameCategoryInput)) body: RenameCategoryInput) {
    return this.rename.execute(body);
  }

  @Post('delete-category')
  deleteCategory(@Body(new ZodValidationPipe(deleteCategoryInput)) body: DeleteCategoryInput) {
    return this.del.execute(body);
  }

  @Post('list-categories')
  listCategories() {
    return this.list.execute();
  }

  @Post('propose-category-change')
  proposeCategoryChange(
    @Body(new ZodValidationPipe(proposeCategoryChangeInput)) body: ProposeCategoryChangeInput,
  ) {
    return this.propose.execute(body);
  }
}
