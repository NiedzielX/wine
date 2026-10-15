import type { Role } from '../auth/types';

/**
 * Demo accounts of the Halka demo restaurant. DEMO DATA ONLY: the password is public
 * (`{@link DEMO_PASSWORD}`), so these accounts must never exist on a real installation.
 * Real accounts are created with `npm run user:create`. The hashes are scrypt hashes of the demo password (N=2^15, r=8, p=3).
 */
export const DEMO_PASSWORD = 'demo-halka-2026';

export interface DemoUser {
  key: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
}

export const DEMO_USERS: DemoUser[] = [
  { key: 'marta', email: 'marta@halka.pl', name: 'Marta Wierzbicka', role: 'sommelier', passwordHash: 'scrypt$32768$8$3$9PKx1Y0do/WlnJMdGoRJdQ==$/MvaNkqQK92vhqBKRqj7u4SSUuOBtgPdDxfTu2tl+C0=' },
  { key: 'tomasz', email: 'tomasz@halka.pl', name: 'Tomasz Lis', role: 'manager', passwordHash: 'scrypt$32768$8$3$jl7o9EmQR93JCQyA86fBcg==$tBLJloREW2pPbeqwYsJ7HnyiEdVhZQjdmqVuHF44z0E=' },
  { key: 'kelner', email: 'kelner@halka.pl', name: 'Jan Kelner', role: 'waiter', passwordHash: 'scrypt$32768$8$3$T3wrQ5Esxw89cETvF3ykXA==$uMSu7pbEVyw7YVncFmPJmEC6EU9LiukCbdhhmiZisY0=' }
];
