import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { t } from "@/lib/locale";

export const SectionHeader = ({ title, subtitle, linkTo, linkLabel = "Voir tout", testId }) => (
    <div className="mb-5 flex items-end justify-between gap-4" data-testid={testId}>
        <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t(title)}</h2>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{t(subtitle)}</p>}
        </div>
        {linkTo && (
            <Link
                to={linkTo}
                className="group inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
            >
                {t(linkLabel)}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
        )}
    </div>
);
