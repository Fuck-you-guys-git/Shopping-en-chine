import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight, TrendingUp, TrendingDown, ShoppingBag, Package, DollarSign, Users } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSeller } from "@/context/SellerContext";
import { formatPrice } from "@/components/ProductCard";

const PIE_COLORS = ["hsl(8 72% 52%)", "hsl(22 62% 60%)", "hsl(40 70% 60%)", "hsl(152 30% 42%)", "hsl(210 30% 40%)", "hsl(280 30% 50%)"];

const StatCard = ({ label, value, trend, icon: Icon, positive = true, suffix }) => (
    <div className="bg-card rounded-2xl p-5 shadow-card border border-border/50">
        <div className="flex items-start justify-between mb-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Icon className="h-4 w-4" />
            </div>
            {trend && (
                <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? "text-success" : "text-destructive"}`}>
                    {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {trend}
                </span>
            )}
        </div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
        <p className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {value}
            {suffix && <span className="text-base text-muted-foreground ml-1 font-sans">{suffix}</span>}
        </p>
    </div>
);

export default function Dashboard() {
    const { metrics, orders, STATUS_LABELS } = useSeller();
    const recent = orders.slice(0, 6);

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Revenu (30j)" value={formatPrice(metrics.revenue30)} trend="+12.4%" icon={DollarSign} />
                <StatCard label="Commandes (30j)" value={metrics.orders30} trend="+8.2%" icon={ShoppingBag} />
                <StatCard label="Panier moyen" value={formatPrice(metrics.avgBasket)} trend="+3.1%" icon={Package} />
                <StatCard label="Actives" value={metrics.active} trend={`${metrics.delivered} livrées`} icon={Users} positive />
            </div>

            {/* Chart + Pie */}
            <div className="grid lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h3 className="font-display text-lg font-medium">Évolution du chiffre d'affaires</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">14 derniers jours</p>
                        </div>
                        <Badge className="bg-success/15 text-success hover:bg-success/15 border-0">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            +12.4%
                        </Badge>
                    </div>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={metrics.daily} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="hsl(8 72% 52%)" stopOpacity={0.35} />
                                        <stop offset="100%" stopColor="hsl(8 72% 52%)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="day" stroke="hsl(20 8% 42%)" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                <YAxis stroke="hsl(20 8% 42%)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip
                                    contentStyle={{ background: "hsl(20 20% 10%)", border: "none", borderRadius: 12, color: "white", fontSize: 12 }}
                                    formatter={(v) => [formatPrice(v), "CA"]}
                                    cursor={{ stroke: "hsl(8 72% 52%)", strokeWidth: 1, strokeDasharray: 4 }}
                                />
                                <Area type="monotone" dataKey="revenue" stroke="hsl(8 72% 52%)" strokeWidth={2.5} fill="url(#rev)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50">
                    <h3 className="font-display text-lg font-medium mb-1">Par catégorie</h3>
                    <p className="text-xs text-muted-foreground mb-4">Répartition du CA</p>
                    {metrics.catDist.length > 0 ? (
                        <>
                            <div className="h-40">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={metrics.catDist} innerRadius={45} outerRadius={70} dataKey="value" stroke="none">
                                            {metrics.catDist.map((_, i) => (
                                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ background: "hsl(20 20% 10%)", border: "none", borderRadius: 12, color: "white", fontSize: 12 }} formatter={(v) => formatPrice(v)} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="space-y-1.5 mt-2">
                                {metrics.catDist.slice(0, 5).map((c, i) => (
                                    <div key={c.name} className="flex items-center gap-2 text-xs">
                                        <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                        <span className="flex-1 text-foreground">{c.name}</span>
                                        <span className="text-muted-foreground">{formatPrice(c.value)}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground py-8 text-center">Pas encore de données</p>
                    )}
                </div>
            </div>

            {/* Recent orders + top products */}
            <div className="grid lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-card rounded-2xl shadow-card border border-border/50">
                    <div className="p-5 md:p-6 flex items-center justify-between">
                        <div>
                            <h3 className="font-display text-lg font-medium">Commandes récentes</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">Mises à jour en temps réel</p>
                        </div>
                        <Button asChild variant="ghost" size="sm">
                            <Link to="/vendeur/commandes">Voir tout <ArrowRight className="ml-1 h-4 w-4" /></Link>
                        </Button>
                    </div>
                    <div className="divide-y divide-border">
                        {recent.map((o) => (
                            <div key={o.id} className="flex items-center gap-4 px-5 md:px-6 py-3">
                                <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold shrink-0">
                                    {o.customer.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{o.customer}</p>
                                    <p className="text-xs text-muted-foreground truncate">{o.id} · {o.city}</p>
                                </div>
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_LABELS[o.status].color} shrink-0 hidden sm:inline-flex`}>
                                    {STATUS_LABELS[o.status].label}
                                </span>
                                <span className="font-display font-semibold text-sm shrink-0 whitespace-nowrap">{formatPrice(o.total)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-card rounded-2xl p-5 md:p-6 shadow-card border border-border/50">
                    <h3 className="font-display text-lg font-medium mb-1">Top produits</h3>
                    <p className="text-xs text-muted-foreground mb-4">Par chiffre d'affaires</p>
                    <div className="space-y-3">
                        {metrics.topProducts.length === 0 && (
                            <p className="text-sm text-muted-foreground py-4 text-center">Aucune vente</p>
                        )}
                        {metrics.topProducts.map((p, i) => (
                            <Link to={`/produit/${p.id}`} key={p.id} className="flex items-center gap-3 group">
                                <span className="font-display text-lg text-muted-foreground w-4">{i + 1}</span>
                                <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted shrink-0">
                                    <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{p.name}</p>
                                    <p className="text-xs text-muted-foreground">{formatPrice(p.soldRevenue)}</p>
                                </div>
                                <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
