export interface Book {
  id: string;
  isbn: string;
  title: string;
  author: string;
  category: string;
  publisher: string;
  publicationYear: number;
  replacementCost: number;
  totalCopies: number;
  availableCopies: number;
  description?: string;
  coverUrl?: string;
}