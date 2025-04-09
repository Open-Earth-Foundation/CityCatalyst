import { Skeleton } from "@/components/ui/skeleton";

export interface MetricItem {
  value: number | string;
  label: string;
}

export interface MetricsProps {
  title?: string;
  description?: string;
  metrics: MetricItem[];
  isLoading?: boolean;
}

const Metrics = ({
  title,
  description,
  metrics,
  isLoading = false,
}: MetricsProps) => {
  return (
    <section className="py-16 px-6 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Optional section title and description */}
        {title && (
          <h2 className="text-3xl font-bold text-gray-800 mb-8">{title}</h2>
        )}

        {description && (
          <p className="max-w-3xl mb-10 text-gray-600">{description}</p>
        )}

        {/* Metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.map((metric, index) => (
            <div key={index} className="bg-gray-50 p-6 rounded-md">
              <div className="text-gray-500 uppercase text-xs tracking-wider font-medium mb-2">
                {metric.label}
              </div>
              {isLoading ? (
                <Skeleton className="h-12 w-24 bg-gray-200" />
              ) : (
                <div className="text-4xl md:text-5xl font-bold text-gray-800">
                  {metric.value}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Metrics;
