/*
 * Langue + devise du site.
 * - Les prix du catalogue sont TOUJOURS en F CFA (XOF) côté serveur.
 * - L'affichage convertit : 1 EUR = 800 F CFA · 1 USD = 750 F CFA.
 * - Le PAIEMENT reste débité en F CFA (Paxity + Stripe) — l'affichage
 *   en €/$ est indicatif pour les clients d'Europe / des USA.
 * - t(fr) : renvoie la traduction anglaise si la langue est "en".
 */

// Barème fixé par le marchand : un produit à 9 000 F CFA vaut 28 € et 32 $.
// => prix EUR = prix CFA ÷ 321,43 (9000/28) · prix USD = prix CFA ÷ 281,25 (9000/32)
export const RATES = { XOF: 1, EUR: 9000 / 28, USD: 9000 / 32 };

export const LOCALE_PRESETS = [
    { id: "sn", flag: "🇸🇳", lang: "fr", currency: "XOF", label: "Afrique · FCFA", short: "FR · F CFA" },
    { id: "eu", flag: "🇪🇺", lang: "fr", currency: "EUR", label: "Europe · EUR", short: "FR · €" },
    { id: "us", flag: "🇺🇸", lang: "en", currency: "USD", label: "USA · USD", short: "EN · $" },
];

// État module (mis à jour par LocaleContext AVANT chaque re-render)
let current = { lang: "fr", currency: "XOF", country: null };
export const getLocale = () => current;
export const setLocaleValues = (lang, currency, country = null) => {
    current = { lang, currency, country };
};

/** Formate un montant F CFA dans la devise d'affichage courante. */
const fmtCurrency = (value, locale, currency) => {
    // Montant entier -> "20 €" ; sinon toujours 2 décimales -> "12,50 €"
    const isWhole = Math.abs(value - Math.round(value)) < 0.005;
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: isWhole ? 0 : 2,
        maximumFractionDigits: isWhole ? 0 : 2,
    }).format(value);
};

export const formatMoney = (xof) => {
    const v = Number(xof) || 0;
    if (current.currency === "EUR") {
        return fmtCurrency(v / RATES.EUR, "fr-FR", "EUR");
    }
    if (current.currency === "USD") {
        return fmtCurrency(v / RATES.USD, "en-US", "USD");
    }
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(v))} F`;
};

/** Montant F CFA formaté brut (pour la note « débité en F CFA »). */
export const formatXof = (xof) =>
    `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(Number(xof) || 0))} F CFA`;

/** Toujours en F CFA, quel que soit le choix du visiteur (dashboard vendeur). */
export const formatCfa = (xof) =>
    `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(Number(xof) || 0))} F`;

/**
 * Équivalents devises : DÉSACTIVÉ à la demande du marchand.
 * - Mode FCFA -> "" : les clients africains ne voient QUE le prix en F CFA.
 * - Mode EUR/USD -> "" : les clients Europe/USA ne voient JAMAIS de prix en F CFA.
 */
export const formatEquivalents = () => "";

// ---------------------------------------------------------------------------
// Dictionnaire FR -> EN (la clé est le texte français affiché)
// ---------------------------------------------------------------------------
const EN = {
    // Navbar / topbar
    "Livraison Chine → Dakar en 10–20 jours": "China → Dakar delivery in 10–20 days",
    "Service client 7j/7": "Customer service 7/7",
    "Espace vendeur": "Seller area",
    "Accueil": "Home",
    "Boutique": "Shop",
    "Achat en gros": "Wholesale",
    "Suivi de colis": "Track package",
    "Suivi de commande": "Order tracking",
    "Rechercher...": "Search...",
    "Que cherchez-vous ?": "What are you looking for?",
    "Menu de navigation": "Navigation menu",
    // Catégories
    "Mode": "Fashion",
    "Électronique": "Electronics",
    "Maison": "Home & Living",
    "Beauté": "Beauty",
    "Enfants": "Kids",
    "Cuisine": "Kitchen",
    // Sous-catégories
    "Vêtements": "Clothing",
    "Chaussures": "Shoes",
    "Sacs": "Bags",
    "Lunettes": "Glasses",
    "Accessoires": "Accessories",
    "Bijoux": "Jewelry",
    "Montres": "Watches",
    "Smartphones": "Smartphones",
    "Tablettes": "Tablets",
    "Ordinateurs": "Computers",
    "Caméras": "Cameras",
    "Montres connectées": "Smartwatches",
    "Écouteurs & Casques": "Earbuds & Headphones",
    "Chargeurs & Câbles": "Chargers & Cables",
    "Éclairage LED": "LED Lighting",
    "Jeux & Gaming": "Games & Gaming",
    "Chambre à coucher": "Bedroom",
    "Salon": "Living room",
    "Salle de bain": "Bathroom",
    "Décoration": "Decoration",
    "Meubles": "Furniture",
    "Tapis": "Rugs",
    "Rideaux": "Curtains",
    "Éclairage": "Lighting",
    "Rangement & Organisation": "Storage & Organization",
    "Jardin & Extérieur": "Garden & Outdoor",
    "Soins": "Skincare",
    "Maquillage": "Makeup",
    "Parfums": "Perfumes",
    "Appareils de beauté": "Beauty devices",
    "Vêtements pour filles": "Girls' clothing",
    "Vêtements pour garçons": "Boys' clothing",
    "Jouets": "Toys",
    "Accessoires enfants": "Kids' accessories",
    "Fournitures scolaires": "School supplies",
    // ProductCard
    "Ajouter au panier": "Add to cart",
    "Ajouté au panier": "Added to cart",
    "Ajouté aux favoris ♥": "Added to favorites ♥",
    // Footer
    "Livraison Chine → Dakar en 10–20 jours · Paiement Mobile Money (Wave, Orange Money, MTN). Tout ce dont vous avez besoin, simple à trouver.":
        "China → Dakar delivery in 10–20 days · Mobile Money payment (Wave, Orange Money, MTN). Everything you need, easy to find.",
    "votre@email.com": "your@email.com",
    "−10% offert": "Get −10%",
    "Bienvenue chez Shopping en Chine ✦": "Welcome to Shopping en Chine ✦",
    "Nous avons envoyé un code de -10% à": "We sent a −10% code to",
    "Tous les produits": "All products",
    "Nouveautés": "New arrivals",
    "Aide": "Help",
    "Livraison": "Shipping",
    "Retours": "Returns",
    "À propos": "About",
    "FAQ": "FAQ",
    "Contact": "Contact",
    "Notre histoire": "Our story",
    "Vendeurs": "Sellers",
    "Carrières": "Careers",
    "Presse": "Press",
    "Blog": "Blog",
    "Tous droits réservés.": "All rights reserved.",
    "Confidentialité": "Privacy",
    "Conditions": "Terms",
    "Cookies": "Cookies",
    // Panier / CartDrawer
    "Votre panier": "Your cart",
    "Votre panier est vide": "Your cart is empty",
    "Découvrez notre sélection et ajoutez vos coups de cœur.": "Discover our selection and add your favorites.",
    "Explorer la boutique": "Explore the shop",
    "Taille": "Size",
    "Sous-total": "Subtotal",
    "Livraison Chine → Dakar": "China → Dakar delivery",
    "10–20 jours": "10–20 days",
    "Total": "Total",
    "Passer commande": "Checkout",
    "Paiement 100% sécurisé": "100% secure payment",
    // Page panier
    "Continuer mes achats": "Continue shopping",
    "Mon panier": "My cart",
    "Rien encore ? Laissez-vous inspirer par nos coups de cœur.": "Nothing yet? Get inspired by our favorites.",
    "article": "item",
    "articles": "items",
    "prêts à partir chez vous": "ready to ship to you",
    "Code promo": "Promo code",
    "Appliquer": "Apply",
    "Essayez": "Try",
    "Code appliqué · −10%": "Code applied · −10%",
    "Code invalide": "Invalid code",
    "Réduction (−10%)": "Discount (−10%)",
    "Total TTC": "Total",
    "Vider le panier": "Empty cart",
    "En stock": "In stock",
    "Récapitulatif": "Summary",
    // Home
    "Tout, plus simple.": "Everything, made simple.",
    "Livraison Chine → Dakar en 10–20 jours · Paiement Mobile Money": "China → Dakar delivery in 10–20 days · Mobile Money payment",
    "Chercher": "Search",
    "Tout voir": "View all",
    "Produits populaires": "Popular products",
    "Voir tout": "See all",
    "⭐ Offre limitée": "⭐ Limited offer",
    "−30% sur l'Électronique": "−30% on Electronics",
    "jusqu'à dimanche": "until Sunday",
    "Casques, gadgets, accessoires connectés.": "Headphones, gadgets, connected accessories.",
    "Profiter": "Shop now",
    "Toutes les catégories": "All categories",
    "Nouveautés de la semaine": "New this week",
    "Paiement sécurisé": "Secure payment",
    "Mobile Money (Wave, Orange, MTN)": "Mobile Money (Wave, Orange, MTN)",
    "Service client": "Customer service",
    "7 jours / 7, en français": "7 days a week",
    "En 10–20 jours": "In 10–20 days",
    // Boutique
    "Catégories": "Categories",
    "Prix": "Price",
    "et +": "and up",
    "Toute la boutique": "All products",
    "produit": "product",
    "produits": "products",
    "trié pour vous": "sorted for you",
    "triés pour vous": "sorted for you",
    "Filtres": "Filters",
    "Trier par": "Sort by",
    "Pertinence": "Relevance",
    "Prix croissant": "Price: low to high",
    "Prix décroissant": "Price: high to low",
    "Tout": "All",
    "Effacer tout": "Clear all",
    "Aucun produit trouvé": "No products found",
    "Essayez d'ajuster vos filtres.": "Try adjusting your filters.",
    "Réinitialiser les filtres": "Reset filters",
    // Fiche produit
    "Chargement du produit…": "Loading product…",
    "Produit introuvable": "Product not found",
    "Retour à la boutique": "Back to shop",
    "Retour": "Back",
    "Couleur :": "Color:",
    "Sélectionnée": "Selected",
    "(optionnel)": "(optional)",
    "Acheter maintenant →": "Buy now →",
    "Livré en 10–20 jours": "Delivered in 10–20 days",
    "Description": "Description",
    "Caractéristiques": "Specifications",
    "Référence": "Reference",
    "Catégorie": "Category",
    "Poids": "Weight",
    "Origine": "Origin",
    "Chine · Contrôle qualité UE": "China · EU quality control",
    "Matériaux": "Materials",
    "Premium, hypoallergéniques": "Premium, hypoallergenic",
    "Conçu pour durer et vivre avec vous, ce produit combine matériaux nobles et savoir-faire moderne. Chaque détail a été pensé pour une expérience quotidienne agréable et sans friction.":
        "Designed to last and live with you, this product combines premium materials and modern craftsmanship. Every detail is thought out for a pleasant, friction-free daily experience.",
    "en 10–20 jours.": "in 10–20 days.",
    "Vous aimerez aussi": "You may also like",
    // Suivi
    "Où est mon colis ?": "Where is my package?",
    "Entrez votre numéro de commande (reçu après le paiement) pour suivre votre colis de la Chine jusqu'à Dakar.":
        "Enter your order number (received after payment) to track your package from China to your door.",
    "Suivre": "Track",
    "Commande introuvable. Vérifiez votre numéro de commande.": "Order not found. Please check your order number.",
    "Le numéro figure sur l'écran de confirmation et commence par « ord_ ».": "The number is shown on the confirmation screen.",
    "Commande": "Order",
    "Paiement confirmé": "Payment confirmed",
    "Paiement en attente": "Payment pending",
    "Paiement échoué": "Payment failed",
    "Passée le": "Placed on",
    "Livraison estimée :": "Estimated delivery:",
    "entre le": "between",
    "et le": "and",
    "Suivi du colis": "Package tracking",
    "En cours": "In progress",
    "Articles": "Items",
    "Vous n'avez pas encore commandé ?": "Haven't ordered yet?",
    "Découvrir la boutique": "Discover the shop",
    "Paiement annulé": "Payment cancelled",
    "Aucun montant n'a été débité. Vos articles sont toujours dans votre panier.": "No amount was charged. Your items are still in your cart.",
    "Reprendre le paiement": "Resume payment",
    // Étapes de suivi (labels backend)
    "Commandé": "Ordered",
    "Expédié de Chine": "Shipped from China",
    "En douane": "In customs",
    "En livraison à Dakar": "Out for delivery",
    "Livré": "Delivered",
    // Checkout
    "Retour au panier": "Back to cart",
    "Adresse": "Address",
    "Paiement": "Payment",
    "Adresse de livraison": "Shipping address",
    "Prénom": "First name",
    "Nom": "Last name",
    "Email": "Email",
    "Code postal": "ZIP code",
    "Ville": "City",
    "Téléphone": "Phone",
    "Continuer": "Continue",
    "Veuillez remplir tous les champs requis": "Please fill in all required fields",
    "Mode de livraison": "Shipping method",
    // Options de livraison (étape 2)
    "Livraison économique Chine-Dakar": "Economy shipping China-Dakar",
    "Livraison express Chine-Dakar": "Express shipping China-Dakar",
    "15 à 20 jours ouvrés": "15 to 20 business days",
    "5 à 7 jours ouvrés": "5 to 7 business days",
    "Une option plus économique, spécialement conçue pour les clients ayant des colis de poids important, afin de bénéficier de frais de livraison plus avantageux.":
        "A more economical option, specially designed for customers with heavy packages, to benefit from lower shipping costs.",
    "Pour recevoir votre commande plus rapidement, choisissez cette option express.":
        "To receive your order faster, choose this express option.",
    "Le délai estimatif est de 15 à 20 jours ouvrés.": "The estimated delivery time is 15 to 20 business days.",
    "Le délai estimatif est de 5 à 7 jours ouvrés après l'expédition.": "The estimated delivery time is 5 to 7 business days after shipment.",
    "Après votre commande, votre colis est pesé afin de déterminer vos frais de livraison.":
        "After your order, your package is weighed to determine your shipping costs.",
    "Le calcul est simple :": "The calculation is simple:",
    "Poids du colis (en kg)": "Package weight (in kg)",
    "Le montant obtenu correspond à vos frais de livraison jusqu'à Dakar.": "The resulting amount is your shipping cost to Dakar.",
    "Une fois votre colis prêt à être expédié, nous vous communiquerons le montant exact de vos frais de livraison.":
        "Once your package is ready to ship, we will let you know the exact amount of your shipping costs.",
    "Vous avez le choix :": "You can choose to:",
    "payer vos frais de livraison avant l'expédition, ou": "pay your shipping costs before shipment, or",
    "payer à l'arrivée de votre colis à Dakar.": "pay when your package arrives in Dakar.",
    "Les frais de livraison sont calculés uniquement lorsque le colis est pesé et prêt à être expédié.":
        "Shipping costs are calculated only when the package is weighed and ready to ship.",
    "Et une fois à Dakar le livreur vous contactera pour la réception de votre colis.":
        "Once in Dakar, the courier will contact you to deliver your package.",
    "Les frais de livraison à domicile sont à la charge du client. Ils sont fixés à":
        "Home delivery fees are paid by the customer. They are fixed at",
    "quel que soit le lieu de livraison à Dakar.": "regardless of the delivery location in Dakar.",
    // Option internationale (Europe/USA)
    "Livraison Chine-Europe": "China-Europe shipping",
    "Livraison Chine-USA": "China-USA shipping",
    "Livraison Chine-Canada": "China-Canada shipping",
    "Voir les détails": "See details",
    "Le montant obtenu correspond à vos frais de livraison jusqu'à New York.": "The resulting amount is your shipping cost to New York.",
    "Dès l'arrivée de votre colis à New York, notre assistante vous contactera pour organiser sa réception, soit par livraison (ces frais restent à votre charge), soit par remise en main propre.":
        "As soon as your package arrives in New York, our assistant will contact you to arrange its reception, either by delivery (these costs remain at your expense) or by hand delivery.",
    "Une option pensée pour vous permettre de recevoir votre commande en toute sérénité.":
        "An option designed so you can receive your order with complete peace of mind.",
    "En cas de perte du colis ou de retenue par les services douaniers, vous bénéficiez d'un remboursement intégral, conformément aux conditions de cette option.":
        "In case of package loss or customs retention, you benefit from a full refund, in accordance with the terms of this option.",
    "Délai estimatif : 15 à 20 jours ouvrés.": "Estimated delivery time: 15 to 20 business days.",
    "Le montant obtenu correspond à vos frais de livraison.": "The resulting amount is your shipping cost.",
    "Une fois votre colis prêt à être expédié, nous vous communiquerons le montant exact de vos frais de livraison afin de finaliser votre paiement via un lien sécurisé que vous recevrez.":
        "Once your package is ready to ship, we will let you know the exact amount of your shipping costs so you can complete the payment via a secure link that you will receive.",
    "payer vos frais de livraison avant l'expédition": "pay your shipping costs before shipment",
    "Dès l'arrivée de votre colis dans votre pays, notre assistante vous contactera pour organiser sa réception, soit par livraison (ces frais restent à votre charge), soit par remise en main propre.":
        "As soon as your package arrives in your country, our assistant will contact you to arrange its reception, either by delivery (these costs remain at your expense) or by hand delivery.",
    "Livraison standard · Chine → Dakar": "Standard delivery · China → Dakar",
    "Choisissez votre moyen de paiement": "Choose your payment method",
    "Carte bancaire": "Card",
    "Paiement par carte sécurisé (Visa, Mastercard)": "Secure card payment (Visa, Mastercard)",
    "Payez directement sur le site, sans redirection.": "Pay directly on the site, no redirect.",
    "Paiement sécurisé via Stripe · Chiffrement bout-en-bout": "Secure payment via Stripe · End-to-end encryption",
    "Paiement sécurisé via Paxity · Chiffrement bout-en-bout": "Secure payment via Paxity · End-to-end encryption",
    "Payer par carte": "Pay by card",
    "Chargement…": "Loading…",
    "Indicatif": "Code",
    "Numéro de téléphone": "Phone number",
    "Code OTP": "OTP code",
    "(facultatif)": "(optional)",
    "Laissez vide si non requis": "Leave empty if not required",
    "Après validation, vous recevrez un lien de paiement à confirmer. Si votre opérateur vous a déjà fourni un code, saisissez-le ici.":
        "After validation you will receive a payment link to confirm. If your operator already gave you a code, enter it here.",
    "Payer": "Pay",
    "Traitement…": "Processing…",
    "attendu :": "expected:",
    "saisi :": "entered:",
    "chiffres": "digits",
    "Paiement momentanément indisponible": "Payment temporarily unavailable",
    "Numéro de téléphone invalide": "Invalid phone number",
    "Pour l'indicatif": "For country code",
    "le numéro doit contenir": "the number must contain",
    "Vous avez saisi": "You entered",
    "Code OTP requis": "OTP code required",
    "exige un code OTP avant de valider le paiement.": "requires an OTP code before confirming the payment.",
    "Le paiement en ligne est en cours de maintenance. Veuillez réessayer dans quelques instants.":
        "Online payment is under maintenance. Please try again in a few moments.",
    "Panier vide": "Empty cart",
    "Ajoutez des produits avant de commander.": "Add products before checking out.",
    "Voir la boutique": "View shop",
    "Votre commande": "Your order",
    "Le montant est débité en F CFA :": "The amount is charged in F CFA:",
    "Vous payez par carte dans votre devise :": "You pay by card in your currency:",
    "Mobile Money : le montant est débité en F CFA :": "Mobile Money: the amount is charged in F CFA:",
    "Retour au récapitulatif": "Back to summary",
    // Écrans de statut paiement
    "Votre commande est confirmée 🎉": "Your order is confirmed 🎉",
    "Merci ! Votre paiement de": "Thank you! Your payment of",
    "a bien été reçu. Nous préparons votre commande pour l'expédition depuis la Chine.":
        "has been received. We are preparing your order for shipment from China.",
    "Suivre ma commande": "Track my order",
    "Retour à l'accueil": "Back to home",
    "Continuer les achats": "Continue shopping",
    "Paiement en cours…": "Payment in progress…",
    "Ouvrez l'application": "Open the",
    "sur votre téléphone et validez la transaction.": "app on your phone and confirm the transaction.",
    "Payer maintenant": "Pay now",
    "Après le paiement,": "After paying,",
    "revenez sur cet onglet": "come back to this tab",
    ": votre confirmation s'affichera ici automatiquement.": ": your confirmation will appear here automatically.",
    "J'ai payé — Vérifier": "I paid — Verify",
    "Vérification…": "Verifying…",
    "En attente de confirmation Paxity": "Waiting for Paxity confirmation",
    "Annuler et choisir un autre moyen de paiement": "Cancel and choose another payment method",
    "Paiement confirmé ✦": "Payment confirmed ✦",
    "Paiement toujours en attente": "Payment still pending",
    "Validez la transaction sur votre téléphone, puis revérifiez.": "Confirm the transaction on your phone, then verify again.",
    "Vérification impossible": "Verification failed",
    "Vérifiez votre connexion et réessayez.": "Check your connection and try again.",
    "Veuillez réessayer": "Please try again",
    "Validez la transaction sur votre téléphone.": "Confirm the transaction on your phone.",
    "Paiement refusé": "Payment declined",
    "Réessayez ou changez de moyen.": "Try again or change method.",
    "Erreur de paiement": "Payment error",
    "Paiement carte indisponible": "Card payment unavailable",
    "Réessayez ou utilisez Mobile Money.": "Try again or use Mobile Money.",
    // PaymentSuccess
    "Vérification du paiement…": "Verifying payment…",
    "Un instant, nous confirmons votre transaction.": "One moment, we are confirming your transaction.",
    "Merci pour votre achat ! Livraison Chine → Dakar sous 10 à 20 jours.": "Thank you for your purchase! China → Dakar delivery in 10–20 days.",
    "N° de commande :": "Order no.:",
    "Vérification en cours": "Verification in progress",
    "Paiement non confirmé": "Payment not confirmed",
    "Votre paiement est peut-être encore en traitement. Vérifiez vos emails ou réessayez.":
        "Your payment may still be processing. Check your emails or try again.",
    "Le paiement n'a pas abouti. Vos articles sont toujours dans votre panier.": "The payment did not go through. Your items are still in your cart.",
    "Réessayer le paiement": "Retry payment",
    // OrderSummary
    "Détails de la commande": "Order details",
    "Livraison à": "Deliver to",
    // Achat en gros
    "Lancez votre business avec un fournisseur de confiance": "Launch your business with a trusted supplier",
    "Vous souhaitez créer votre propre boutique ou développer votre activité ? Nous sommes ravis de vous accompagner en tant que fournisseur pour vos achats en gros. Découvrez une large sélection de produits adaptés aux professionnels, avec des solutions pensées pour les revendeurs, boutiques et entrepreneurs.":
        "Want to start your own shop or grow your business? We are delighted to support you as a supplier for your wholesale purchases. Discover a wide selection of products for professionals, with solutions designed for resellers, shops and entrepreneurs.",
    "Pour toute demande de tarifs en gros, disponibilité des produits ou informations commerciales, contactez notre service commercial dès maintenant. Nous serons heureux de vous accompagner dans la réussite de votre projet.":
        "For any wholesale pricing request, product availability or business information, contact our sales team now. We will be happy to help make your project a success.",
    "📲 Contact commercial :": "📲 Sales contact:",
    "Appeler": "Call",
    "🌍 Nous expédions partout dans le monde": "🌍 We ship worldwide",
    "Chine → Afrique, Europe, Amérique… votre commande vous suit où que vous soyez.": "China → Africa, Europe, America… your order follows you wherever you are.",
    // À propos
    "Qui sommes-nous": "Who we are",
    "La Chine à portée de main,": "China within reach,",
    "depuis Dakar": "from Dakar",
    "Shopping en Chine est née d'une idée simple : permettre à chacun au Sénégal et en Afrique de l'Ouest de commander des produits de qualité directement de Chine, sans se soucier de la logistique, de la douane ou du paiement. Vous choisissez, nous nous occupons de tout le reste.":
        "Shopping en Chine was born from a simple idea: allowing everyone to order quality products directly from China, without worrying about logistics, customs or payment. You choose, we take care of everything else.",
    "Import direct de Chine": "Direct import from China",
    "Nous sélectionnons et importons vos produits directement depuis les meilleurs fournisseurs chinois, sans intermédiaire.":
        "We select and import your products directly from the best Chinese suppliers, with no middleman.",
    "Livraison Dakar en 10–20 jours": "Delivery in 10–20 days",
    "Suivi de colis en temps réel, de la commande jusqu'à votre porte : Commandé → Expédié → Douane → Livré.":
        "Real-time package tracking, from order to your door: Ordered → Shipped → Customs → Delivered.",
    "Paiement 100 % sécurisé": "100% secure payment",
    "Wave, Orange Money, MTN ou carte bancaire. Votre argent est protégé, vous êtes notifié à chaque étape.":
        "Wave, Orange Money, MTN or card. Your money is protected and you are notified at every step.",
    "Une équipe basée à Dakar, disponible en français, qui répond à toutes vos questions avant et après l'achat.":
        "A dedicated team, available 7 days a week, answering all your questions before and after purchase.",
};

export const t = (fr) => (current.lang === "en" ? (EN[fr] ?? fr) : fr);
