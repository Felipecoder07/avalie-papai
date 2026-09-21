import { LayoutDashboard, Building2, FileText, Wallet, Users, Megaphone, ShieldCheck, Settings, Calendar, BarChart3, CreditCard } from 'lucide-react';
import type { NavItem } from './SidebarShell';

export const MASTER_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', path: '/master/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'arenas', path: '/master/arenas', label: 'Arenas', icon: Building2 },
  { id: 'arena-detalhe', path: '/master/arena-detalhe', label: 'Detalhe da arena', icon: FileText },
  { id: 'financeiro', path: '/master/financeiro', label: 'Financeiro', icon: Wallet },
  { id: 'usuarios', path: '/master/usuarios', label: 'Usuários', icon: Users },
  { id: 'comunicacao', path: '/master/comunicacao', label: 'Comunicação', icon: Megaphone },
  { id: 'auditoria', path: '/master/auditoria', label: 'Auditoria', icon: ShieldCheck },
  { id: 'configuracoes', path: '/master/configuracoes', label: 'Configurações', icon: Settings },
];

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'reservas', path: '/admin/reservas', label: 'Reservas', icon: Calendar },
  { id: 'pagamentos', path: '/admin/pagamentos', label: 'Pagamentos', icon: Wallet },
  { id: 'clientes', path: '/admin/clientes', label: 'Clientes', icon: Users },
  { id: 'relatorios', path: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
  { id: 'assinatura', path: '/admin/assinatura', label: 'Assinatura', icon: CreditCard },
  { id: 'auditoria', path: '/admin/auditoria', label: 'Auditoria', icon: ShieldCheck },
  { id: 'configuracoes', path: '/admin/configuracoes', label: 'Configurações', icon: Settings },
];
