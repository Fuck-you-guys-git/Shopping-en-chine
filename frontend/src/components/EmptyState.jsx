import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export const EmptyState = ({
    icon = "fa-box-open",
    title,
    description,
    ctaLabel,
    ctaTo,
    onCta,
    testId = "empty-state",
}) => (
    <div
        data-testid={testId}
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center"
    >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-background text-primary shadow-card">
            <i className={`fa-solid ${icon} text-lg`} aria-hidden="true" />
        </span>
        <h3 className="mt-5 text-lg font-bold text-foreground">{title}</h3>
        {description && (
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
        {ctaLabel && (ctaTo || onCta) && (
            <div className="mt-6">
                {ctaTo ? (
                    <Button asChild className="h-11 rounded-full px-6" data-testid={`${testId}-cta`}>
                        <Link to={ctaTo}>{ctaLabel}</Link>
                    </Button>
                ) : (
                    <Button onClick={onCta} className="h-11 rounded-full px-6" data-testid={`${testId}-cta`}>
                        {ctaLabel}
                    </Button>
                )}
            </div>
        )}
    </div>
);
