import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Borrowings } from './borrowings';

describe('Borrowings', () => {
  let component: Borrowings;
  let fixture: ComponentFixture<Borrowings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Borrowings],
    }).compileComponents();

    fixture = TestBed.createComponent(Borrowings);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
