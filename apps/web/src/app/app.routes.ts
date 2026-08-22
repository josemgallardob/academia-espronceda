import { Routes } from '@angular/router';
import { anonymousGuard, authenticatedGuard } from './auth/auth.guards';
import { LoginComponent } from './auth/login/login.component';
import { AuthenticatedLayoutComponent } from './authenticated-layout/authenticated-layout.component';
import { PeopleComponent } from './people/people.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [anonymousGuard],
    title: 'Iniciar sesión · Academia Espronceda',
  },
  {
    path: '',
    component: AuthenticatedLayoutComponent,
    canActivate: [authenticatedGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'personas' },
      {
        path: 'personas',
        component: PeopleComponent,
        title: 'Personas · Academia Espronceda',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
