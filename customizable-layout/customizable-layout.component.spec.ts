import { Component } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { createComponentFactory, Spectator } from '@ngneat/spectator';
import { firstValueFrom } from 'rxjs';
import { CustomizableLayoutComponent } from './customizable-layout.component';
import { LayoutType } from './model/layout-type.enum';
import { WINDOW_REF } from './model/window-ref.token';
import { WithoutHiddenPipe } from './without-hidden-pipe/without-hidden.pipe';

@Component({
  template: '',
  standalone: false,
})
class TestLayoutItemComponent {}

describe('CustomizableLayoutComponent', () => {
  let spectator: Spectator<CustomizableLayoutComponent>;
  const createComponent = createComponentFactory({
    providers: [
      {
        provide: WINDOW_REF,
        useValue: window
      }
    ],
    component: CustomizableLayoutComponent,
    declarations: [WithoutHiddenPipe],
    imports: [CommonModule, DragDropModule],
  });

  it('should create', () => {
    spectator = createComponent({
      props: {
        defaultLayout: {
          name: 'mobile',
          version: 1,
          [LayoutType.Mobile]: {
            cardMargin: '1rem',
            lists: [],
          },
        },
      },
    });

    expect(spectator.component).toBeTruthy();
  });

  it('falls back to mobile layout when tablet and desktop layouts are missing', async () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(1200);

    spectator = createComponent({
      props: {
        defaultLayout: {
          name: 'mobile-only',
          version: 1,
          [LayoutType.Mobile]: {
            cardMargin: '1rem',
            lists: [
              {
                containerName: 'mobile-col',
                items: [],
                width: '1fr',
              },
            ],
          },
        },
      },
    });

    const layout = await firstValueFrom(spectator.component.layout$);

    expect(layout.cardMargin).toBe('1rem');
    expect(layout.lists[0].containerName).toBe('mobile-col');
  });

  it('uses the desktop layout when a desktop config is available', async () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(1200);

    spectator = createComponent({
      props: {
        defaultLayout: {
          name: 'desktop',
          version: 1,
          [LayoutType.Mobile]: {
            cardMargin: '1rem',
            lists: [
              {
                containerName: 'mobile-col',
                items: [],
                width: '1fr',
              },
            ],
          },
          [LayoutType.Desktop]: {
            cardMargin: '2rem',
            lists: [
              {
                containerName: 'desktop-col',
                items: [],
                width: '2fr',
              },
            ],
          },
        },
      },
    });

    const layout = await firstValueFrom(spectator.component.layout$);

    expect(layout.cardMargin).toBe('2rem');
    expect(layout.lists[0].containerName).toBe('desktop-col');
  });

  it('resets back to the default layout instead of keeping the stored layout', () => {
    spectator = createComponent({
      props: {
        componentMap: {
          DefaultComponent: { component: TestLayoutItemComponent },
          CustomizedComponent: { component: TestLayoutItemComponent },
        },
        defaultLayout: {
          name: 'reset-layout',
          version: 1,
          [LayoutType.Mobile]: {
            cardMargin: '1rem',
            lists: [
              {
                containerName: 'default-col',
                items: [
                  { componentName: 'DefaultComponent' },
                ],
                width: '1fr',
              },
            ],
          },
        },
      },
    });

    spectator.component['currentLayout'] = {
      cardMargin: '2rem',
      lists: [
        {
          containerName: 'customized-col',
          items: [
            { componentName: 'CustomizedComponent' },
          ],
          width: '2fr',
        },
      ],
    };

    spectator.component.resetPressed();

    expect(spectator.component['currentLayout'].cardMargin).toBe('1rem');
    expect(spectator.component['currentLayout'].lists[0].containerName).toBe('default-col');
    expect(spectator.component['currentLayout'].lists[0].items[0].componentName).toBe('DefaultComponent');
  });
});
