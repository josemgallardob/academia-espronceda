import type { CanDeactivateFn } from '@angular/router';
import type { PersonFormComponent } from './person-form.component';

export const pendingPersonChangesGuard: CanDeactivateFn<PersonFormComponent> = (component) =>
  component.canDeactivate();
