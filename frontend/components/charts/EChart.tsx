"use client";

import { init } from "echarts/core";
import { useEffect, useRef } from "react";

import type { EChartsOption } from "@/lib/echarts";

interface EChartProps {
  option: EChartsOption;
  height?: number;
  ariaLabel?: string;
}

export function EChart({ option, height = 320, ariaLabel }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof init> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = init(el);
    chartRef.current = chart;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      chart.setOption({ animation: false });
    }
    return () => {
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      style={{ height, width: "100%" }}
    />
  );
}
