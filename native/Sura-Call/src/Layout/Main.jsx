import React from 'react';
import { Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-gray-800 text-white p-4">
        <h1>Header</h1>
      </header>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-200 p-4">
          <nav>
            <ul>
              <li><a href="#">Link 1</a></li>
              <li><a href="#">Link 2</a></li>
              <li><a href="#">Link 3</a></li>
            </ul>
          </nav>
        </aside>

        {/* Scrollable content area */}
        <main className="flex-1 p-6 overflow-auto bg-white">
          <Outlet /> {/* Nested content will be rendered here */}
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-white p-4">
        <p>Footer</p>
      </footer>
    </div>
  );
}
