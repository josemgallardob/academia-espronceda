import { Component, inject } from '@angular/core';
import { AuthStore } from '../auth/auth.store';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  readonly user = inject(AuthStore).user;
}
