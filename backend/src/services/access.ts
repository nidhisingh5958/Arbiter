import type { Role, UserDTO } from '@arbiter/shared';
import type { ContractsTable } from '../db/types';
import { forbidden } from '../lib/errors';

export function requireRole(user: UserDTO, roles: Role[], action: string): void {
  if (!roles.includes(user.role)) {
    throw forbidden(`Only ${roles.join(' or ')} users can ${action} (you are signed in as ${user.role})`);
  }
}

export function isBuyerOf(user: UserDTO, c: ContractsTable): boolean {
  return user.role === 'buyer' && c.buyer_id === user.id;
}

export function isContractorOf(user: UserDTO, c: ContractsTable): boolean {
  return user.role === 'contractor' && c.contractor_id === user.id;
}

export function canView(user: UserDTO, c: ContractsTable): boolean {
  return user.role === 'admin' || c.buyer_id === user.id || c.contractor_id === user.id;
}

export function assertCanView(user: UserDTO, c: ContractsTable): void {
  if (!canView(user, c)) throw forbidden('You are not a party to this contract');
}

export const actorOf = (user: UserDTO) => `user:${user.id}`;
