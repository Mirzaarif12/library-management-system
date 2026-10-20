import { Service, afterNextRender, effect, signal } from '@angular/core';
import type{ Book } from '../../models/book';

@Service()
export class BookService {
// Signal to indicate whether the storage is ready
 private readonly storageReady = signal(false);
 
    constructor() {
    afterNextRender(() => {
        try {
        const saved = localStorage.getItem('library-books');

        if (saved) {
            const parsed: unknown = JSON.parse(saved);

            if (Array.isArray(parsed)) {
            this.books.set(parsed as Book[]);
            }
        }
        } catch {
        // Keep the sample books if saved data can't be read.
        } finally {
        this.storageReady.set(true);
        }
    });

    effect(() => {
        if (!this.storageReady()) return;

        localStorage.setItem('library-books', JSON.stringify(this.books()));
    });
    }

   readonly books = signal<Book[]>([
    {
      id: 'BK-001',
      isbn: '9780465050659',
      title: 'The Design of Everyday Things',
      author: 'Don Norman',
      category: 'Design',
      publisher: 'Basic Books',
      publicationYear: 2013,
      replacementCost: 30,
      totalCopies: 5,
      availableCopies: 3,
    },
    {
      id: 'BK-002',
      isbn: '9780735211292',
      title: 'Atomic Habits',
      author: 'James Clear',
      category: 'Self-Help',
      publisher: 'Avery',
      publicationYear: 2018,
      replacementCost: 25,
      totalCopies: 5,
      availableCopies: 5,
    },
    {
      id: 'BK-003',
      isbn: '9780525559474',
      title: 'The Midnight Library',
      author: 'Matt Haig',
      category: 'Fiction',
      publisher: 'Viking',
      publicationYear: 2020,
      replacementCost: 20,
      totalCopies: 5,
      availableCopies: 3,
    },
    {
      id: 'BK-004',
      isbn: '9780735211292',
      title: 'The 7 Habits of Highly Effective People',
      author: 'Stephen R. Covey',
      category: 'Self-Help',
      publisher: 'Simon & Schuster',
      publicationYear: 2004,
      replacementCost: 25,
      totalCopies: 5,
      availableCopies: 5,
    },
    {
      id: 'BK-005',
      isbn: '9780143127741',
      title: 'Sapiens: A Brief History of Humankind',
      author: 'Yuval Noah Harari',
      category: 'History',
      publisher: 'HarperCollins',
      publicationYear: 2011,
      replacementCost: 45,
      totalCopies: 5,
      availableCopies: 5,
    },
    {
      id: 'BK-006',
      isbn: '9780062316097',
      title: 'The Alchemist',
      author: 'Paulo Coelho',
      category: 'Fiction',
      publisher: 'HarperCollins',
      publicationYear: 1988,
      replacementCost: 49.90,
      totalCopies: 5,
      availableCopies: 5,
    },
  ]);
}
