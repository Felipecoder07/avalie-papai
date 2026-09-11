import Chart from 'react-apexcharts';

interface LineChartProps {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}

export function LineChart({ data, height = 240, color = '#1C1A18', formatValue = (v) => String(v) }: Readonly<LineChartProps>) {
  const options: any = {
    chart: {
      type: 'line',
      zoom: {
        enabled: false,
      },
      toolbar: {
        show: false,
      },
      fontFamily: 'Inter, sans-serif',
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      curve: 'smooth',
      width: 3.5,
    },
    colors: [color],
    grid: {
      borderColor: 'rgba(28, 26, 24, 0.08)',
      row: {
        colors: ['rgba(28, 26, 24, 0.02)', 'transparent'],
        opacity: 0.5,
      },
    },
    xaxis: {
      categories: data.map((d) => d.label),
      labels: {
        style: {
          colors: '#8A847E',
          fontSize: '11px',
        },
      },
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      labels: {
        formatter: (v: number) => formatValue(Math.round(v)),
        style: {
          colors: '#8A847E',
          fontSize: '11px',
        },
      },
    },
    tooltip: {
      theme: 'light',
      y: {
        formatter: (v: number) => formatValue(v),
      },
    },
    markers: {
      size: 4,
      colors: ['#FCFBF8'],
      strokeColors: color,
      strokeWidth: 2,
      hover: {
        size: 6,
      }
    }
  };

  const series = [
    {
      name: 'Novas Arenas',
      data: data.map((d) => d.value),
    },
  ];

  return (
    <div className="w-full">
      <Chart options={options} series={series} type="line" height={height} />
    </div>
  );
}
