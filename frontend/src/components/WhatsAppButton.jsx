import { WHATSAPP_NUMBER, WHATSAPP_MESSAGE } from "@/config";

export const WhatsAppButton = () => {
    if (!WHATSAPP_NUMBER) return null;
    const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            data-testid="whatsapp-float-btn"
            aria-label="Discuter sur WhatsApp"
            className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full bg-[#25D366] shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        >
            <i className="fa-brands fa-whatsapp text-white text-3xl" />
        </a>
    );
};
