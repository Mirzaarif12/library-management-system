import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReservationQueue } from './reservation-queue';

describe('ReservationQueue', () => {
  let component: ReservationQueue;
  let fixture: ComponentFixture<ReservationQueue>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationQueue],
    }).compileComponents();

    fixture = TestBed.createComponent(ReservationQueue);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
