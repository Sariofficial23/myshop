import { Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@myshop/database';
import type { AuthContext } from '../auth/auth-context.js';

export interface AuditEntry {
  action: AuditAction;
  entity: string;
  entityId?: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
}

/**
 * Журнал критических операций. Пишется в ТОЙ ЖЕ транзакции, что и сама операция:
 * если операция откатилась — записи в журнале тоже нет.
 */
@Injectable()
export class AuditService {
  async log(tx: Prisma.TransactionClient, ctx: AuthContext, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        ip: ctx.ip?.slice(0, 64),
        userAgent: ctx.userAgent,
      },
    });
  }
}
