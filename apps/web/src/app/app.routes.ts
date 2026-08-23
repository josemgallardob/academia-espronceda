import { Routes } from '@angular/router';
import { anonymousGuard, authenticatedGuard } from './auth/auth.guards';
import { LoginComponent } from './auth/login/login.component';
import { AuthenticatedLayoutComponent } from './authenticated-layout/authenticated-layout.component';
import { PeopleComponent } from './people/people.component';
import { PersonDetailComponent } from './people/person-detail/person-detail.component';
import { PersonFormComponent } from './people/person-form/person-form.component';
import { pendingPersonChangesGuard } from './people/person-form/pending-person-changes.guard';

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
      {
        path: 'personas/nueva',
        component: PersonFormComponent,
        canDeactivate: [pendingPersonChangesGuard],
        title: 'Nueva persona · Academia Espronceda',
      },
      {
        path: 'personas/:personId/editar',
        component: PersonFormComponent,
        canDeactivate: [pendingPersonChangesGuard],
        title: 'Editar persona · Academia Espronceda',
      },
      {
        path: 'personas/:personId',
        component: PersonDetailComponent,
        title: 'Detalle de persona · Academia Espronceda',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
