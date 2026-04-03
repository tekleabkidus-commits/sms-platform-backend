import { Activity, BadgeCent, FileClock, FolderKanban, KeyRound, LayoutDashboard, MessageSquareText, Network, RadioTower, Route, ScrollText, Send, Shapes, ShieldAlert, Users, Wallet, type LucideIcon } from 'lucide-react';
import { Role } from './api-types';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Tenant owner',
  admin: 'Platform admin',
  finance: 'Finance',
  support: 'Operations / support',
  developer: 'Developer',
  viewer: 'Viewer',
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'admin', 'finance', 'support', 'developer', 'viewer'] },
  { href: '/send', label: 'Send SMS', icon: Send, roles: ['owner', 'admin', 'support', 'developer'] },
  { href: '/messages', label: 'Messages', icon: MessageSquareText, roles: ['owner', 'admin', 'support', 'developer', 'viewer'] },
  { href: '/campaigns', label: 'Campaigns', icon: FolderKanban, roles: ['owner', 'admin', 'support', 'developer', 'viewer'] },
  { href: '/contacts', label: 'Contacts', icon: Users, roles: ['owner', 'admin', 'support', 'developer', 'viewer'] },
  { href: '/templates', label: 'Templates', icon: Shapes, roles: ['owner', 'admin', 'support', 'developer', 'viewer'] },
  { href: '/sender-ids', label: 'Sender IDs', icon: RadioTower, roles: ['owner', 'admin', 'support', 'developer', 'viewer'] },
  { href: '/wallet', label: 'Wallet & Billing', icon: Wallet, roles: ['owner', 'admin', 'finance', 'support', 'viewer'] },
  { href: '/developer/api-keys', label: 'API Keys', icon: KeyRound, roles: ['owner', 'admin', 'developer'] },
  { href: '/developer/docs', label: 'API Docs', icon: ScrollText, roles: ['owner', 'admin', 'developer', 'viewer'] },
  { href: '/admin/providers', label: 'Providers', icon: Network, roles: ['admin', 'support'] },
  { href: '/admin/routing', label: 'Routing', icon: Route, roles: ['admin', 'support'] },
  { href: '/admin/pricing', label: 'Pricing', icon: BadgeCent, roles: ['admin', 'support'] },
  { href: '/admin/retries', label: 'Retry Policies', icon: FileClock, roles: ['admin', 'support'] },
  { href: '/ops/console', label: 'Operations', icon: Activity, roles: ['admin', 'support'] },
  { href: '/audit', label: 'Audit Logs', icon: ScrollText, roles: ['owner', 'admin', 'finance', 'support', 'viewer'] },
  { href: '/compliance', label: 'Fraud & Compliance', icon: ShieldAlert, roles: ['owner', 'admin', 'support'] },
];

export function canAccess(role: Role, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(role);
}
