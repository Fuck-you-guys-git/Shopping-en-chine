export const SkeletonCard = () => (
    <div className="flex flex-col" data-testid="skeleton-card" aria-hidden="true">
        <div className="aspect-[4/5] w-full animate-pulse rounded-xl bg-muted" />
        <div className="mt-3 h-3.5 w-4/5 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3.5 w-2/5 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-5 w-1/3 animate-pulse rounded bg-muted" />
    </div>
);

export const SkeletonGrid = ({ count = 8, className = "" }) => (
    <div className={`grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4 ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
            <SkeletonCard key={i} />
        ))}
    </div>
);
