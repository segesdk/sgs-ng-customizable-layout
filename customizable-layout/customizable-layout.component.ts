import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, EventEmitter, Inject, Injector, Input, OnDestroy, OnInit, Output } from '@angular/core';
import * as _ from 'lodash';
import { BehaviorSubject, combineLatest, fromEvent, Observable, Subscription } from 'rxjs';
import { filter, map, startWith } from 'rxjs/operators';
import { createGuid } from 'src/app/shared/functions/create-guid.fn';
import { ComponentMap } from './model/component-map.interface';
import { CustomizableLayoutConfig, isCustomizableLayoutConfig } from './model/customizable-layout-config.interface';
import { CustomizableLayout } from './model/customizable-layout.interface';
import { LayoutElement } from './model/layout-element.interface';
import { LayoutList } from './model/layout-list.interface';
import { LayoutType } from './model/layout-type.enum';
import { WINDOW_REF } from './model/window-ref.token';

@Component({
  selector: 'ng-customizable-layout',
  templateUrl: './customizable-layout.component.html',
  styleUrls: ['./customizable-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomizableLayoutComponent implements OnInit, OnDestroy {
  @Output() layoutChanged = new EventEmitter<CustomizableLayout>();
  @Input() defaultLayout: CustomizableLayoutConfig;
  @Input() componentInjector: Injector;
  @Input() componentMap: ComponentMap;
  @Input() editing: boolean;

  @Input() desktopBreakpoint = 1024;
  @Input() tabletBreakpoint = 990;
  @Input() mobileBreakpoint = 420;
  
  private _layoutState = new BehaviorSubject<CustomizableLayoutConfig | null>(null);
  private _layoutType: LayoutType = LayoutType.Mobile; // Mobile first <3
  private subs = new Subscription();
  
  dragDelay$: Observable<number>;
  layoutType$: Observable<LayoutType>;
  layout$: Observable<CustomizableLayout>;
  templateColumns$: Observable<string>;

  constructor(@Inject(WINDOW_REF) private windowRef: Window) {}

  ngOnInit(): void {
    this.initializeState();
    this.layoutType$ = fromEvent(this.windowRef, 'resize')
    .pipe(
      map((e: any) => e.target?.innerWidth),
      startWith(this.windowRef.innerWidth),
      map(width => {
        if (width <= this.tabletBreakpoint) {
          return LayoutType.Mobile;
        } else {
          return LayoutType.Tablet;
        }
        // TODO: Support desktop layout, fallback to tablet, then mobile
      }));
      this.dragDelay$ = this.layoutType$.pipe(map(layout => {
        switch (layout) {
          case LayoutType.Mobile : {
            return 150;
          } default : {
            return 0;
          }
        }
      }));
    this.subs.add(this.layoutType$.subscribe((type) => {
      this._layoutType = type;
    }));
    this.layout$ = combineLatest([this.layoutType$, this._layoutState]).pipe(
      filter(u => u !== null && u !== undefined),
      map(() => {
        const layout = this.getConnectedLists(this.currentLayout);
        this.layoutChanged.next(layout);
        return layout;
      })
    );
    this.templateColumns$ = combineLatest([this.layoutType$, this._layoutState]).pipe(
      map(() => {
        return this.currentColumns;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  initializeState() {
    let storedLayout = JSON.parse(this.windowRef.localStorage.getItem(this.defaultLayout.name));
    if (isCustomizableLayoutConfig(storedLayout) && this.defaultLayout.version <= storedLayout.version) {
      //Figure out if there are any new components in the default layout that needs to be added to the stored layout.
      this.addMissingComponentsToStoredLayout(storedLayout, this.defaultLayout, LayoutType.Mobile);
      this.addMissingComponentsToStoredLayout(storedLayout, this.defaultLayout, LayoutType.Tablet);
      this.addMissingComponentsToStoredLayout(storedLayout, this.defaultLayout, LayoutType.Desktop);
      this._layoutState.next(storedLayout);
    } else {
      this._layoutState.next(this.createCopy(this.defaultLayout));
    }
  }

  private addMissingComponentsToStoredLayout(storedLayoutConfig: CustomizableLayoutConfig, defaultLayoutConfig: CustomizableLayoutConfig, layoutType: LayoutType) {
    const storedLayout: CustomizableLayout | undefined = storedLayoutConfig[layoutType];
    const defaultLayout: CustomizableLayout | undefined = defaultLayoutConfig[layoutType];

    if(!storedLayout || !defaultLayout)
      return;

      const defaultLayoutElementsGrouped = _.groupBy(defaultLayout.lists, l => l.containerName);
      const defaultLayoutElements = defaultLayout.lists.flatMap(column => column.items);
      const storedLayoutElements = storedLayout.lists.flatMap(column => column.items);

      const missingElementNames = defaultLayoutElements.map(le=>le.componentName).filter(elem => storedLayoutElements.map(le=>le.componentName).indexOf(elem) < 0);
      
      if(missingElementNames.length > 0)
      {
        missingElementNames.forEach(missingComponentName => {

          //Now find the component somewhere in the default layout to get the correct container and position/index.
          const containerName = _.findKey(defaultLayoutElementsGrouped, (lists, containerName) => {
            return lists.find(l => l.containerName === containerName)?.items.find(i => i.componentName === missingComponentName) !== undefined;
          });

          const defaultElementsInContainer = defaultLayoutElementsGrouped[containerName][0].items;
          let defaultElementIndex = defaultElementsInContainer.findIndex(e=> e.componentName === missingComponentName);
          const element = defaultElementsInContainer[defaultElementIndex];

          const storedLayoutItems = storedLayout.lists.find(l=>l.containerName === containerName).items;
          
          if(defaultElementIndex > storedLayoutItems.length)
            defaultElementIndex = 0;  //Just place in top if index is not applicable.
          
          storedLayout.lists.find(l=>l.containerName === containerName).items.splice(defaultElementIndex, 0, element);
        });        
      }
  }

  drop(event: CdkDragDrop<LayoutElement[]>) {
    let layout = this.currentLayout;
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      const index = layout.lists.map(l => l.containerName).indexOf(event.container.id);
      layout.lists[index].items = [...event.container.data];
    } else {
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
      const prevListIndex = layout.lists.map(l => l.containerName).indexOf(event.previousContainer.id);
      const currListIndex = layout.lists.map(l => l.containerName).indexOf(event.container.id);
      layout.lists[prevListIndex].items = [...event.previousContainer.data];
      layout.lists[currListIndex].items = [...event.container.data];
    }
    this.currentLayout = { ...layout };
  }

  addColumnRightPressed() {
    this.currentLayout = {
      ...this.currentLayout,
      lists: [...this.currentLayout.lists, this.getEmptyList()],
    };
    this.updateLayout();
  }

  addColumnLeftPressed() {
    this.currentLayout = {
      ...this.currentLayout,
      lists: [this.getEmptyList(), ...this.currentLayout.lists],
    };
    this.updateLayout();
  }

  removeColumnLeftPressed() {
    let spillOver = this.currentLayout.lists[0].items;
    let lists = this.currentLayout.lists.slice(1);
    lists[0].items.push(...spillOver);
    this.currentLayout = {
      ...this.currentLayout,
      lists,
    };
    this.updateLayout();
  }

  removeColumnRightPressed() {
    let lists = this.currentLayout.lists;
    let spillOver = lists[lists.length - 1].items;
    const removedList = lists.pop();
    lists[lists.length - 1].items.push(...spillOver);
    this.currentLayout = {
      ...this.currentLayout,
      lists,
    };
    this.updateLayout();
  }

  resetPressed() {
    this.currentLayout = this.createCopy(this.getConnectedLists(this.defaultLayout[this._layoutType]));
  }

  cardTrackBy(index: number, name: LayoutElement): string {
    return name.componentName;
  }

  listTrackBy(index: number, list: LayoutList): string {
    return list.containerName;
  }
  
  private updateLayout() {
    this.currentLayout = this.getConnectedLists(this.currentLayout);
  }

  private getConnectedLists(layout: CustomizableLayout): CustomizableLayout {
    return {
      ...layout,
      lists: layout?.lists.map(l => ({
        ...l,
        connectedTo: this.getConnectedToString(l.containerName),
      })),
    };
  }

  private getConnectedToString(self: string): string[] {
    return this.currentLayout.lists.map(l => l.containerName).filter(cn => cn !== self);
  }

  private getEmptyList(): LayoutList {
    return {
      items: [],
      width: '1fr',
      connectedTo: [],
      containerName: createGuid(),
    };
  }

  private get currentColumns(): string {
    return this.currentLayout.lists.map(l => l.width).reduce((cur, prev) => cur + ' ' + prev, '');
  }

  private get currentLayout(): CustomizableLayout {
    return this._layoutState.getValue()[this._layoutType];
  }

  private set currentLayout(newVal: CustomizableLayout) {
    const updatedLayout = {
      ...this._layoutState.getValue(),
      [this._layoutType]: newVal
    }
    this._layoutState.next(updatedLayout);
    this.windowRef.localStorage.setItem(updatedLayout.name, JSON.stringify(updatedLayout));
  }

  private createCopy(obj: any): any {
    return JSON.parse(JSON.stringify(obj));
  }
}
