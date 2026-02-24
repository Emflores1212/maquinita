'use client';

import { useMemo, useState, useTransition } from 'react';
import Papa from 'papaparse';
import { Download, Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { importProductsAction, type ImportSkippedRow } from '@/app/actions/products';
import type { CsvPreviewRow } from '@/components/products/types';

type CsvRowPayload = {
  name: string;
  sku: string | null;
  category: string | null;
  price: number;
  description: string | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  allergens: string[];
  clientRowIndex: number;
};

function parseOptionalNumber(value: string | null): number | null {
  if (!value?.trim()) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export default function ProductImportClient() {
  const t = useTranslations('productImport');
  const [isImporting, startImport] = useTransition();
  const [previewRows, setPreviewRows] = useState<CsvPreviewRow[]>([]);
  const [serverSkippedRows, setServerSkippedRows] = useState<ImportSkippedRow[]>([]);
  const [resultMessage, setResultMessage] = useState<string>('');

  const validRows = useMemo<CsvRowPayload[]>(() => {
    return previewRows
      .filter((row) => !row.error)
      .map((entry) => ({
        name: entry.row.name.trim(),
        sku: entry.row.sku?.trim() || null,
        category: entry.row.category?.trim() || null,
        price: Number(entry.row.price),
        description: entry.row.description?.trim() || null,
        calories: parseOptionalNumber(entry.row.calories),
        protein: parseOptionalNumber(entry.row.protein),
        fat: parseOptionalNumber(entry.row.fat),
        carbs: parseOptionalNumber(entry.row.carbs),
        allergens: (entry.row.allergens ?? '')
          .split(/[|,]/g)
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
        clientRowIndex: entry.rowIndex,
      }));
  }, [previewRows]);

  const skippedForDownload = useMemo(() => {
    const localSkipped = previewRows
      .filter((row) => row.error)
      .map((row) => ({
        rowIndex: row.rowIndex,
        reason: row.error as string,
        row: row.row,
      }));

    const remoteSkipped = serverSkippedRows.map((row) => ({
      rowIndex: row.rowIndex,
      reason: row.reason,
      row: {
        name: row.row.name,
        sku: row.row.sku ?? '',
        category: row.row.category ?? '',
        price: String(row.row.price),
        description: row.row.description ?? '',
        calories: row.row.calories !== null && row.row.calories !== undefined ? String(row.row.calories) : '',
        protein: row.row.protein !== null && row.row.protein !== undefined ? String(row.row.protein) : '',
        fat: row.row.fat !== null && row.row.fat !== undefined ? String(row.row.fat) : '',
        carbs: row.row.carbs !== null && row.row.carbs !== undefined ? String(row.row.carbs) : '',
        allergens: (row.row.allergens ?? []).join('|'),
      },
    }));

    return [...localSkipped, ...remoteSkipped];
  }, [previewRows, serverSkippedRows]);

  const downloadTemplate = () => {
    const csv = Papa.unparse([
      {
        name: '',
        sku: '',
        category: '',
        price: '',
        description: '',
        calories: '',
        protein: '',
        fat: '',
        carbs: '',
        allergens: '',
      },
    ]);

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'maquinita-products-template.csv');
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadSkipped = () => {
    const csv = Papa.unparse(
      skippedForDownload.map((entry) => ({
        row_index: entry.rowIndex,
        reason: entry.reason,
        ...entry.row,
      }))
    );

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'maquinita-products-skipped.csv');
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (file: File) => {
    setResultMessage('');
    setServerSkippedRows([]);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows: CsvPreviewRow[] = result.data.map((raw, index) => {
          const normalized = {
            name: normalizeString(raw.name),
            sku: normalizeString(raw.sku) || null,
            category: normalizeString(raw.category) || null,
            price: normalizeString(raw.price),
            description: normalizeString(raw.description) || null,
            calories: normalizeString(raw.calories) || null,
            protein: normalizeString(raw.protein) || null,
            fat: normalizeString(raw.fat) || null,
            carbs: normalizeString(raw.carbs) || null,
            allergens: normalizeString(raw.allergens) || null,
          };

          let error: string | null = null;
          if (!normalized.name) {
            error = t('errors.missingName');
          } else {
            const numericPrice = Number(normalized.price);
            if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
              error = t('errors.invalidPrice');
            }
          }

          return {
            rowIndex: index + 2,
            row: normalized,
            error,
          };
        });

        setPreviewRows(rows);
      },
    });
  };

  const importValidRows = () => {
    if (validRows.length === 0) {
      return;
    }

    setResultMessage('');
    startImport(async () => {
      const result = await importProductsAction({ rows: validRows });

      if (!result.ok) {
        setResultMessage(result.error ?? t('importError'));
        return;
      }

      const imported = result.importedCount ?? 0;
      const skipped = result.skippedCount ?? 0;
      setServerSkippedRows(result.skippedRows ?? []);
      setResultMessage(t('importResult', { imported, skipped }));
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-2 text-sm font-semibold text-slate-800">{t('step1')}</p>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          {t('downloadTemplate')}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-2 text-sm font-semibold text-slate-800">{t('step2')}</p>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 hover:bg-slate-100">
          <Upload className="h-4 w-4" />
          <span>{t('uploadCsv')}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                handleFile(file);
              }
            }}
          />
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">{t('step3')}</p>
          <p className="text-xs text-slate-500">
            {t('validCount', { count: validRows.length })} • {t('invalidCount', { count: previewRows.length - validRows.length })}
          </p>
        </div>

        <div className="max-h-[340px] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">{t('headers.name')}</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">{t('headers.category')}</th>
                <th className="px-3 py-2">{t('headers.price')}</th>
                <th className="px-3 py-2">{t('headers.error')}</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((previewRow) => (
                <tr key={`${previewRow.rowIndex}-${previewRow.row.name}`} className={previewRow.error ? 'bg-red-50' : 'bg-white'}>
                  <td className="px-3 py-2 text-xs text-slate-500">{previewRow.rowIndex}</td>
                  <td className="px-3 py-2">{previewRow.row.name || '-'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{previewRow.row.sku || '-'}</td>
                  <td className="px-3 py-2">{previewRow.row.category || '-'}</td>
                  <td className="px-3 py-2">{previewRow.row.price || '-'}</td>
                  <td className="px-3 py-2 text-xs text-red-600">{previewRow.error || '-'}</td>
                </tr>
              ))}

              {previewRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                    {t('empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-800">{t('step4')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={validRows.length === 0 || isImporting}
            onClick={importValidRows}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0D2B4E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A2240] disabled:opacity-70"
          >
            {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('importButton', { count: validRows.length })}
          </button>

          {skippedForDownload.length > 0 ? (
            <button
              type="button"
              onClick={downloadSkipped}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              {t('downloadSkipped')}
            </button>
          ) : null}
        </div>

        {resultMessage ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{resultMessage}</div>
        ) : null}
      </div>
    </div>
  );
}
