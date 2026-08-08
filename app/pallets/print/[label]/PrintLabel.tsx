"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

type Pallet = {
  label: string;
  quantity: number;
  workOrderNumber: string;
  itemSku: string;
  itemName: string;
  locationCode: string;
  locationType: string;
  createdAt: string | Date;
};

export default function PrintLabel({ pallet }: { pallet: Pallet }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current) {
      JsBarcode(svgRef.current, pallet.label, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: false,
        margin: 0,
      });
    }
  }, [pallet.label]);

  return (
    <div>
      {/* Screen-only controls, hidden when actually printing */}
      <div className="p-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400"
        >
          Print
        </button>
      </div>

      <div className="label-sheet">
        <div className="tag">{pallet.locationType}</div>
        <div className="sku">{pallet.itemSku}</div>
        <div className="name">{pallet.itemName}</div>

        <svg ref={svgRef} className="barcode" />
        <div className="label-text">{pallet.label}</div>

        <div className="details">
          <div>Qty: {pallet.quantity.toLocaleString()}</div>
          <div>WO: {pallet.workOrderNumber}</div>
          <div>{new Date(pallet.createdAt).toLocaleDateString()}</div>
        </div>
      </div>

 <style>{`
  @page {
    size: 10cm 15cm;
    margin: 0;
  }

  body {
    background: white;
    color: black;
  }

  .label-sheet {
    width: 10cm;
    height: 15cm;
    padding: 0.5cm;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: monospace;
    color: black;
  }

  .tag {
    font-size: 24pt;
    font-weight: bold;
    letter-spacing: 2px;
    border: 3px solid black;
    padding: 4px 16px;
    margin-bottom: 16px;
  }

  .sku {
    font-size: 20pt;
    font-weight: bold;
  }

  .name {
    font-size: 12pt;
    margin-bottom: 16px;
    text-align: center;
  }

  .barcode {
    width: 90%;
    margin-bottom: 4px;
  }

  .label-text {
    font-size: 10pt;
    letter-spacing: 1px;
    margin-bottom: 16px;
  }

  .details {
    font-size: 11pt;
    text-align: center;
  }

  @media screen {
    .label-sheet {
      border: 1px dashed #999;
      margin: 16px;
    }
  }
`}</style>
    </div>
  );
}