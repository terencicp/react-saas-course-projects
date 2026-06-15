'use client';

import { createTranslator } from 'next-intl';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { type Locale, SUPPORTED_LOCALES } from '@/lib/i18n/supported';

// Provided in full. Drives each locale's `invoices.list.count` ICU `plural`
// message from a single count input, so the CLDR category transitions are
// visible side by side — en-US `No invoices`/`1 invoice`/`5 invoices`, fr-FR
// `Aucune facture`/`1 facture`/`1 000 000 de factures` (the `many` branch).
//
// Uses next-intl's `createTranslator` (the same ICU engine `t()` runs on) against
// the per-locale catalog the server hands in. Before the catalogs are filled (S1)
// the server falls back to the en-US subtree for empty locales, so the probe
// renders without throwing `MISSING_MESSAGE`.
type CatalogMessages = Record<string, unknown>;

export const PluralProbe = ({
  catalogs,
}: {
  catalogs: Record<Locale, CatalogMessages>;
}) => {
  const [count, setCount] = useState(5);

  const outputs = useMemo(
    () =>
      SUPPORTED_LOCALES.map((locale) => {
        // The catalog shape is dynamic (any locale's JSON), so the translator's
        // key inference can't narrow — call it through a loose string signature.
        const t = createTranslator({
          locale,
          messages: catalogs[locale],
          namespace: 'invoices.list',
        }) as unknown as (
          key: string,
          values?: Record<string, number>,
        ) => string;
        return { locale, text: t('count', { count }) };
      }),
    [count, catalogs],
  );

  return (
    <section data-testid="plural-probe" className="space-y-3">
      <h2 className="font-medium">Pluralization probe</h2>
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground" htmlFor="plural-count">
          Count
        </label>
        <Input
          id="plural-count"
          data-testid="plural-probe-input"
          type="number"
          min={0}
          value={count}
          onChange={(event) => setCount(Number(event.target.value) || 0)}
          className="w-40"
        />
      </div>
      <ul className="space-y-1 text-sm">
        {outputs.map(({ locale, text }) => (
          <li
            key={locale}
            data-testid="plural-probe-output"
            data-locale={locale}
            className="flex gap-3 font-mono"
          >
            <span className="text-muted-foreground">{locale}</span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
