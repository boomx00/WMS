"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

type Location = {
  code: string;
  type: string;
  area: string | null;
  x: number | null;
  y: number | null;
};

export default function PrintLocationLabel({ location }: { location: Location }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current) {
      JsBarcode(svgRef.current, location.code, {
        format: "CODE128",
        width: 3,
        height: 80,
        displayValue: false,
        margin: 0,
      });
    }
  }, [location.code]);

  return (
    <div>
      <div className="p-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400"
        >
          Print
        </button>
      </div>

      <div className="label-sheet">
        <div className="type-tag">{location.type}</div>

        <div className="code">{location.code}</div>

        <svg ref={svgRef} className="barcode" />

        {location.type === "RACK" && (
          <div className="coords">
            Area {location.area} &middot; X{location.x} &middot; Y{location.y}
          </div>
        )}
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

        .type-tag {
          font-size: 20pt;
          font-weight: bold;
          letter-spacing: 2px;
          border: 3px solid black;
          padding: 4px 16px;
          margin-bottom: 24px;
        }

        .code {
          font-size: 36pt;
          font-weight: bold;
          margin-bottom: 24px;
        }

        .barcode {
          width: 90%;
          margin-bottom: 16px;
        }

        .coords {
          font-size: 12pt;
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