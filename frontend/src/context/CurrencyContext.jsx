import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { paymentsAPI } from "@/lib/api";
import { formatMoney } from "@/lib/money";

const CurrencyContext = createContext(null);
const STORAGE_KEY = "sec_currency_v1";
const FALLBACK_RATES = { XOF: 1 };
const PAXITY_OFF = { enabled: false, org_id: null };

export const CURRENCIES = [
    { code: "XOF", label: "F CFA" },
    { code: "EUR", label: "€ EUR" },
    { code: "USD", label: "$ USD" },
];

/** Display currency + payment configuration (exchange rates, Paxity) from the backend. */
export const CurrencyProvider = ({ children }) => {
    const [config, setConfig] = useState(null);
    const [currency, setCurrencyState] = useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) || "XOF";
        } catch {
            return "XOF";
        }
    });

    useEffect(() => {
        paymentsAPI.config().then(setConfig).catch(() => setConfig(null));
    }, []);

    const rates = config?.currencies || FALLBACK_RATES;
    const active = rates[currency] ? currency : "XOF";

    const setCurrency = (code) => {
        setCurrencyState(code);
        try {
            localStorage.setItem(STORAGE_KEY, code);
        } catch {
            // storage unavailable (private mode): the choice lasts for this visit
        }
    };

    const format = useCallback((amountXof) => formatMoney(amountXof, active, rates), [active, rates]);

    return (
        <CurrencyContext.Provider
            value={{ currency: active, setCurrency, format, rates, paxity: config?.paxity || PAXITY_OFF }}
        >
            {children}
        </CurrencyContext.Provider>
    );
};

export const useCurrency = () => {
    const ctx = useContext(CurrencyContext);
    if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
    return ctx;
};
