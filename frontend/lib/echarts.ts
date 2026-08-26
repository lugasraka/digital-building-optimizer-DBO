// Modular echarts registration: only bundle the chart types we render.
import { use } from "echarts/core";
import {
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  RadarChart,
} from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import type {
  BarSeriesOption,
  HeatmapSeriesOption,
  LineSeriesOption,
  PieSeriesOption,
  RadarSeriesOption,
} from "echarts/charts";
import type {
  GridComponentOption,
  LegendComponentOption,
  TitleComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ComposeOption } from "echarts/core";

use([
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  RadarChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export type EChartsOption = ComposeOption<
  | BarSeriesOption
  | HeatmapSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | RadarSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | TitleComponentOption
  | TooltipComponentOption
  | VisualMapComponentOption
>;
