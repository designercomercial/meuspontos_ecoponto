/**
 * Endereços de outros canais do app SASI.
 *
 * PENDENTE: os endereços reais (deep links) de cada canal. Até lá, são
 * configuráveis por variável de ambiente no build (VITE_LINK_*).
 */
export type Links = {
  premios: string;
  meuPerfil: string;
  ecopontos: string;
  faleConosco: string;
  /** PDF do Regulamento, no canal Ajuda. */
  regulamento: string;
};

const env = import.meta.env;

export const LINKS: Links = {
  premios: env.VITE_LINK_PREMIOS ?? "/premios",
  meuPerfil: env.VITE_LINK_MEU_PERFIL ?? "/meu-perfil",
  ecopontos: env.VITE_LINK_ECOPONTOS ?? "/ecopontos",
  faleConosco: env.VITE_LINK_FALE_CONOSCO ?? "/fale-conosco",
  regulamento: env.VITE_LINK_REGULAMENTO ?? "/ajuda/regulamento.pdf",
};
