import {
  MessageSquareCode,
  GitCompareArrows,
  MonitorSmartphone,
  TerminalSquare,
  Webhook,
  Globe,
  Server,
  History,
  Sparkles,
  Gauge,
  PackagePlus,
  Network,
  type LucideIcon,
} from 'lucide-react';

export interface NavLink {
  label: string;
  href: string;
}

export const navLinks: NavLink[] = [
  { label: 'Características', href: '#caracteristicas' },
  { label: 'Cómo funciona', href: '#como-funciona' },
  { label: 'Precios', href: '#precios' },
  { label: 'FAQ', href: '#faq' },
];

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const features: Feature[] = [
  {
    icon: MessageSquareCode,
    title: 'Chat de IA integrado',
    description:
      'Conversa con Claude sin salir del editor. Entiende todo tu proyecto y edita varios archivos a la vez.',
  },
  {
    icon: GitCompareArrows,
    title: 'Diff con aceptar/rechazar',
    description:
      'Revisa cada cambio propuesto en un diff claro y aplica solo lo que quieras, línea por línea.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Preview web y móvil en vivo',
    description:
      'Visualiza tu app en escritorio y móvil con recarga instantánea mientras escribes.',
  },
  {
    icon: TerminalSquare,
    title: 'Consola del preview',
    description:
      'Logs, errores y red del preview integrados. Depura sin cambiar de ventana.',
  },
  {
    icon: Webhook,
    title: 'Cliente API integrado',
    description:
      'Prueba tus endpoints con un cliente tipo Postman dentro del IDE, con historial y entornos.',
  },
  {
    icon: Globe,
    title: 'Gestor de dominios',
    description:
      'Conecta y administra dominios de Hostinger, GoDaddy y Namecheap sin salir de AurCode.',
  },
  {
    icon: Server,
    title: 'Servidores MCP',
    description:
      'Extiende a Claude con herramientas y datos propios mediante el protocolo MCP.',
  },
  {
    icon: History,
    title: 'Historial de conversaciones',
    description:
      'Retoma cualquier sesión. Todo tu contexto y decisiones quedan guardados y buscables.',
  },
  {
    icon: Sparkles,
    title: 'IntelliSense',
    description:
      'Autocompletado inteligente, snippets y resaltado por lenguaje con la velocidad de un IDE nativo.',
  },
  {
    icon: Gauge,
    title: 'Panel de uso y costos',
    description:
      'Controla tokens de entrada/salida, caché y el costo de cada sesión de Claude en tiempo real.',
  },
  {
    icon: PackagePlus,
    title: 'Instalación en un clic',
    description:
      'Detecta dependencias faltantes e instala con el gestor correcto: npm, pnpm, yarn o bun.',
  },
  {
    icon: Network,
    title: 'Terminal y gestor de puertos',
    description:
      'Terminal real integrada y un panel para liberar puertos ocupados sin salir del editor.',
  },
];

export interface Step {
  number: string;
  title: string;
  description: string;
}

export const steps: Step[] = [
  {
    number: '01',
    title: 'Abre tu proyecto',
    description:
      'Importa cualquier repo o carpeta local. AurCode indexa tu código y lo pone al alcance de la IA.',
  },
  {
    number: '02',
    title: 'Pídele a la IA',
    description:
      'Describe lo que quieres construir. Claude propone cambios en un diff que revisas y aceptas.',
  },
  {
    number: '03',
    title: 'Previsualiza y despliega',
    description:
      'Observa el resultado en el preview en vivo y publica tu dominio en segundos.',
  },
];

export interface Showcase {
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  variant: 'chat' | 'preview' | 'domains';
}

export const showcases: Showcase[] = [
  {
    eyebrow: 'Flujo con IA',
    title: 'Conversa, revisa el diff y aplica',
    description:
      'Describe la funcionalidad y deja que Claude escriba el código. Cada propuesta llega como un diff que puedes aceptar o rechazar con un clic.',
    points: [
      'Edición multi-archivo con contexto completo',
      'Aceptar o rechazar cambios línea por línea',
      'Historial de conversaciones siempre disponible',
    ],
    variant: 'chat',
  },
  {
    eyebrow: 'Preview en vivo',
    title: 'Web y móvil, lado a lado',
    description:
      'Ve tu aplicación mientras la construyes. Alterna entre vistas de escritorio y móvil, inspecciona la consola y depura al instante.',
    points: [
      'Recarga instantánea al guardar',
      'Consola y red integradas en el preview',
      'Vista de móvil fiel al dispositivo real',
    ],
    variant: 'preview',
  },
  {
    eyebrow: 'Del código al dominio',
    title: 'Despliega y conecta tu dominio',
    description:
      'Publica tu proyecto y administra dominios de Hostinger, GoDaddy o Namecheap directamente desde AurCode, sin pelear con paneles externos.',
    points: [
      'Integración con Hostinger, GoDaddy y Namecheap',
      'DNS y certificados gestionados por ti',
      'Del commit al dominio en vivo en minutos',
    ],
    variant: 'domains',
  },
];

export interface Plan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

export const plans: Plan[] = [
  {
    name: 'Free',
    price: '$0',
    period: '/mes',
    description: 'Para explorar AurCode y proyectos personales.',
    features: [
      'IDE completo de escritorio',
      'Chat de IA con tu suscripción de Claude',
      'Preview web y móvil',
      '1 dominio conectado',
      'Historial de 7 días',
    ],
    cta: 'Descargar gratis',
  },
  {
    name: 'Pro',
    price: '$19',
    period: '/mes',
    description: 'Para developers que envían a producción cada día.',
    features: [
      'Todo lo de Free',
      'Cliente API integrado',
      'Servidores MCP ilimitados',
      'Dominios ilimitados',
      'Historial ilimitado y buscable',
      'Soporte prioritario',
    ],
    cta: 'Empezar con Pro',
    highlighted: true,
  },
  {
    name: 'Team',
    price: '$39',
    period: '/usuario/mes',
    description: 'Para equipos que construyen juntos.',
    features: [
      'Todo lo de Pro',
      'Espacios de trabajo compartidos',
      'Servidores MCP de equipo',
      'Roles y permisos',
      'Facturación centralizada',
      'SSO y soporte dedicado',
    ],
    cta: 'Hablar con ventas',
  },
];

export interface Faq {
  question: string;
  answer: string;
}

export const faqs: Faq[] = [
  {
    question: '¿Necesito una suscripción de Claude?',
    answer:
      'AurCode usa tu propia suscripción de Claude, así que pagas la IA directamente a Anthropic y mantienes el control de tu uso. No cobramos un margen sobre los tokens.',
  },
  {
    question: '¿En qué sistemas operativos funciona?',
    answer:
      'AurCode es una aplicación de escritorio nativa disponible para macOS, Windows y Linux.',
  },
  {
    question: '¿Mi código sale de mi máquina?',
    answer:
      'Tu código permanece local. Solo el contexto que eliges compartir en el chat viaja a la API de Claude para generar respuestas.',
  },
  {
    question: '¿Qué son los servidores MCP?',
    answer:
      'El Model Context Protocol te permite conectar herramientas, bases de datos y servicios propios para que la IA pueda usarlos como parte de tu flujo de trabajo.',
  },
  {
    question: '¿Puedo cancelar cuando quiera?',
    answer:
      'Sí. Los planes son mensuales y sin permanencia. Puedes cambiar o cancelar tu plan en cualquier momento desde tu cuenta.',
  },
];

export interface FooterColumn {
  title: string;
  links: NavLink[];
}

export const footerColumns: FooterColumn[] = [
  {
    title: 'Producto',
    links: [
      { label: 'Características', href: '#caracteristicas' },
      { label: 'Precios', href: '#precios' },
      { label: 'Descargar', href: '#' },
      { label: 'Novedades', href: '#' },
    ],
  },
  {
    title: 'Recursos',
    links: [
      { label: 'Documentación', href: '#' },
      { label: 'Guías', href: '#' },
      { label: 'Servidores MCP', href: '#' },
      { label: 'Estado', href: '#' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Sobre nosotros', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Contacto', href: '#' },
      { label: 'Privacidad', href: '#' },
    ],
  },
];
