import { Component } from '@angular/core';
import {RouterOutlet} from '@angular/router';
import { Sidebar } from './shared/sidebar/sidebar';
import { Navbar } from './shared/navbar/navbar';

@Component({
  imports: [RouterOutlet, Sidebar, Navbar],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})

export class App {
  
}

