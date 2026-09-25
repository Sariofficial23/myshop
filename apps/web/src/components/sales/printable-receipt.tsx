'use client';

import { isLocale } from '@myshop/shared';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { companyApi } from '@/lib/api/company';
import type { Sale } from '@/lib/api/sales';
import { useMe } from '@/lib/auth/auth-provider';
import { formatAmount } from '@/lib/format/money';

const fullName = (u: { firstName: string; lastName: string | null }) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ');

/**
 * Чек для чекового принтера 80 мм. На экране не виден: рендерится прямо в <body>,
 * а при печати (window.print) стили globals.css прячут всё остальное и оставляют только его.
 */
export function PrintableReceipt({ sale }: { sale: Sale }) {
  // Данные продажи загружаются только в браузере, так что document здесь уже есть.
  if (typeof document === 'undefined') return null;
  return createPortal(<ReceiptBody sale={sale} />, document.body);
}

function ReceiptBody({ sale: s }: { sale: Sale }) {
  const t = useTranslations();
  const format = useFormatter();
  const localeTag = useLocale();
  const locale = isLocale(localeTag) ? localeTag : 'ru';
  const me = useMe();
  const company = useQuery({ queryKey: ['company'], queryFn: companyApi.current });
  const amount = (value: string) => formatAmount(value, locale);
  const footer = company.data?.receiptFooter ?? t('receipt.thanks');

  return (
    <div className="receipt-root" aria-hidden>
      <header className="receipt-center">
        <p className="receipt-title">{me.company.name}</p>
        <p>{s.branch.name}</p>
        {s.branch.address ? <p>{s.branch.address}</p> : null}
        {s.branch.phone ? <p>{t('receipt.phone', { phone: s.branch.phone })}</p> : null}
      </header>

      <hr />
      <p className="receipt-row">
        <span>{t('receipt.number', { number: s.displayNumber })}</span>
        <span>
          {format.dateTime(new Date(s.date), {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </p>
      <p>{t('sale.seller', { name: fullName(s.seller) })}</p>
      {s.customer ? (
        <p>
          {t('sale.customerLine', {
            name: [s.customer.name, s.customer.phone].filter(Boolean).join(', '),
          })}
        </p>
      ) : null}
      <hr />

      {s.items.map((item) => (
        <div key={item.id} className="receipt-item">
          <p className="receipt-bold">
            {[item.variant.product.name, item.variant.name].filter(Boolean).join(' ')}
          </p>
          <p className="receipt-row">
            <span>
              {item.quantity} × {amount(item.price)}
            </span>
            <span>{amount(String(Number(item.price) * item.quantity))}</span>
          </p>
          {Number(item.discount) > 0 ? (
            <p className="receipt-row">
              <span>{t('sale.discount')}</span>
              <span>−{amount(item.discount)}</span>
            </p>
          ) : null}
          {item.serialNumbers.map((serial) => (
            <div key={serial.id}>
              <p>
                {serial.type === 'IMEI' ? 'IMEI' : 'S/N'}: {serial.number}
                {serial.status === 'SOLD' ? '' : ` (${t('returns.returned')})`}
              </p>
              {serial.status === 'SOLD' && serial.warrantyEnd ? (
                <p>
                  {t('sale.warrantyUntil', {
                    date: format.dateTime(new Date(serial.warrantyEnd), {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    }),
                  })}
                </p>
              ) : null}
            </div>
          ))}
          {item.returnedQuantity > 0 && !item.serialNumbers.length ? (
            <p>{t('returns.returnedCount', { count: item.returnedQuantity })}</p>
          ) : null}
        </div>
      ))}

      <hr />
      {Number(s.discountTotal) > 0 ? (
        <>
          <p className="receipt-row">
            <span>{t('sale.subtotal')}</span>
            <span>{amount(s.subtotal)}</span>
          </p>
          <p className="receipt-row">
            <span>{t('sale.discount')}</span>
            <span>−{amount(s.discountTotal)}</span>
          </p>
        </>
      ) : null}
      <p className="receipt-row receipt-total">
        <span>{t('receipt.total')}</span>
        <span>
          {amount(s.total)} {me.company.currency === 'UZS' ? t('receipt.sum') : me.company.currency}
        </span>
      </p>
      {s.payments.map((payment) => (
        <p key={payment.id} className="receipt-row">
          <span>{t(`paymentMethod.${payment.method}`)}</span>
          <span>{amount(payment.amount)}</span>
        </p>
      ))}
      {s.installment ? (
        <>
          <p className="receipt-row">
            <span>{t('receipt.installment', { months: s.installment.months })}</span>
            <span>{amount(s.installment.total)}</span>
          </p>
          <p className="receipt-row receipt-bold">
            <span>{t('installments.remaining')}</span>
            <span>{amount(s.installment.remaining)}</span>
          </p>
        </>
      ) : null}
      {Number(s.refundedTotal) > 0 ? (
        <p className="receipt-row">
          <span>{t('returns.refundedTotal')}</span>
          <span>−{amount(s.refundedTotal)}</span>
        </p>
      ) : null}

      <hr />
      <p className="receipt-center receipt-footer">{footer}</p>
    </div>
  );
}
