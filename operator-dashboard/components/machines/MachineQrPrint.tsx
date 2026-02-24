'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useTranslations } from 'next-intl';

export default function MachineQrPrint({
  name,
  mid,
  address,
}: {
  name: string;
  mid: string;
  address: string | null;
}) {
  const t = useTranslations('machineQr');

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center bg-white px-6 py-10 text-center print:max-w-none print:p-0">
      <div className="mb-2 text-3xl font-black tracking-tight text-[#0D2B4E]">maquinita</div>
      <h1 className="text-3xl font-bold text-slate-900">{name}</h1>
      <p className="mt-2 font-mono text-2xl font-black text-slate-800">{mid}</p>

      <div className="my-8 rounded-2xl border border-slate-200 p-5">
        <QRCodeSVG value={mid} size={280} includeMargin />
      </div>

      <p className="max-w-md text-sm text-slate-600">{address ?? '-'}</p>

      <button
        type="button"
        className="mt-8 rounded-lg bg-[#0D2B4E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A2240] print:hidden"
        onClick={() => window.print()}
      >
        {t('print')}
      </button>
    </div>
  );
}
