import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import {
  BuildingFloor,
  BuildingFurniture,
  BuildingOpening,
  BuildingOpeningKind,
  BuildingPlan,
  BuildingRoom,
  BuildingRoomResourceKind,
  BuildingTool,
  BuildingWallSide,
  FurnitureKind,
  RoomAssignmentCategory,
} from '../types';
import { BuildingOfficeIcon, HomeIcon, PlusIcon, TrashIcon } from './icons';

const ASSIGNMENT_COLORS: Record<RoomAssignmentCategory, string> = {
  educational: '#dbeafe',
  administrative: '#ede9fe',
  support: '#dcfce7',
  utility: '#fef3c7',
  public: '#e5e7eb',
};

const ASSIGNMENT_LABELS: Record<RoomAssignmentCategory, string> = {
  educational: 'Учебное',
  administrative: 'Управление',
  support: 'Хозяйственное',
  utility: 'Техническое',
  public: 'Общее',
};

const RESOURCE_LABELS: Record<BuildingRoomResourceKind, string> = {
  classroom: 'Аудитория',
  cabinet: 'Кабинет',
  none: 'Без справочника',
};

const FURNITURE_LABELS: Record<FurnitureKind, string> = {
  desk: 'Парты',
  chair: 'Стул',
  teacherDesk: 'Стол преподавателя',
  board: 'Доска',
  computer: 'Компьютер',
  projector: 'Проектор',
  cabinet: 'Шкаф',
  shelf: 'Стеллаж',
  sink: 'Мойка',
  table: 'Стол',
};

const GRID_SIZE = 25;
const SNAP_THRESHOLD = 12;

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const createFloor = (number: number): BuildingFloor => ({
  id: createId('floor'),
  name: `${number} этаж`,
  number,
  width: 1000,
  height: 620,
  rooms: [],
  openings: [],
});

const createPlan = (): BuildingPlan => ({
  id: createId('building'),
  name: 'Новый корпус',
  address: '',
  floors: [createFloor(1)],
  updatedAt: new Date().toISOString(),
});

const createRoom = (x: number, y: number, classroomTypeId = '', departmentId = ''): BuildingRoom => ({
  id: createId('room'),
  number: '',
  name: '',
  x,
  y,
  width: 150,
  height: 100,
  capacity: 24,
  resourceKind: 'classroom',
  assignmentCategory: 'educational',
  assignmentName: '',
  classroomTypeId,
  departmentId,
  tagIds: [],
  color: ASSIGNMENT_COLORS.educational,
  furniture: [],
});

const createOpening = (
  kind: BuildingOpeningKind,
  x: number,
  y: number,
  roomId?: string,
  wallSide?: BuildingWallSide
): BuildingOpening => ({
  id: createId(kind),
  kind,
  roomId,
  wallSide,
  x,
  y,
  width: kind === 'door' ? 36 : 54,
  height: 8,
  rotation: 0,
});

const createFurniture = (kind: FurnitureKind, x: number, y: number): BuildingFurniture => ({
  id: createId('furniture'),
  kind,
  x,
  y,
  width: kind === 'board' ? 58 : kind === 'projector' ? 28 : 34,
  height: kind === 'board' ? 10 : kind === 'projector' ? 28 : 24,
  rotation: 0,
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

const snapToTargets = (value: number, targets: number[]) => {
  const nearest = targets.reduce<{ value: number; distance: number } | null>((best, target) => {
    const distance = Math.abs(value - target);
    if (distance > SNAP_THRESHOLD) return best;
    if (!best || distance < best.distance) return { value: target, distance };
    return best;
  }, null);
  return nearest?.value ?? value;
};

const renderFurnitureGraphic = (item: BuildingFurniture) => {
  const baseClass = "absolute inset-0 rounded-sm border border-gray-600 bg-white/75";
  switch (item.kind) {
    case 'chair':
      return <div className="absolute inset-1 rounded-full border-2 border-gray-700 bg-white/70" />;
    case 'desk':
    case 'teacherDesk':
    case 'table':
      return (
        <div className={baseClass}>
          <div className="absolute inset-x-1 top-1 h-1 rounded bg-gray-500/60" />
          <div className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full bg-gray-500" />
          <div className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-gray-500" />
        </div>
      );
    case 'board':
      return <div className="absolute inset-0 rounded-sm border border-emerald-900 bg-emerald-700 shadow-inner" />;
    case 'computer':
      return (
        <div className="absolute inset-0 rounded-sm border border-slate-700 bg-slate-200">
          <div className="absolute left-1 right-1 top-1 bottom-2 rounded-sm bg-slate-800" />
          <div className="absolute left-1/2 bottom-0 h-2 w-3 -translate-x-1/2 bg-slate-600" />
        </div>
      );
    case 'projector':
      return (
        <div className="absolute inset-1 rounded-full border border-indigo-700 bg-indigo-100">
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600" />
        </div>
      );
    case 'cabinet':
      return (
        <div className={baseClass}>
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-500" />
          <div className="absolute left-1 top-1/2 h-1 w-1 rounded-full bg-gray-600" />
          <div className="absolute right-1 top-1/2 h-1 w-1 rounded-full bg-gray-600" />
        </div>
      );
    case 'shelf':
      return (
        <div className={baseClass}>
          <div className="absolute left-1 right-1 top-1/3 h-px bg-gray-600" />
          <div className="absolute left-1 right-1 top-2/3 h-px bg-gray-600" />
        </div>
      );
    case 'sink':
      return (
        <div className="absolute inset-0 rounded-sm border border-sky-700 bg-sky-100">
          <div className="absolute inset-1 rounded-full border border-sky-500 bg-white/70" />
        </div>
      );
    default:
      return <div className={baseClass} />;
  }
};

const BuildingPlanEditor: React.FC = () => {
  const {
    buildingPlans,
    setBuildingPlans,
    syncBuildingPlanRooms,
    classroomTypes,
    classroomTags,
    departments,
    classrooms,
    cabinets,
  } = useStore();

  const [selectedPlanId, setSelectedPlanId] = useState(buildingPlans[0]?.id || '');
  const [selectedFloorId, setSelectedFloorId] = useState(buildingPlans[0]?.floors[0]?.id || '');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedOpeningId, setSelectedOpeningId] = useState('');
  const [tool, setTool] = useState<BuildingTool>('select');
  const [furnitureKind, setFurnitureKind] = useState<FurnitureKind>('desk');
  const [dragState, setDragState] = useState<
    | { kind: 'room'; roomId: string; dx: number; dy: number }
    | { kind: 'opening'; openingId: string }
    | null
  >(null);
  const [syncMessage, setSyncMessage] = useState('');
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const activePlan = useMemo(
    () => buildingPlans.find(plan => plan.id === selectedPlanId) || buildingPlans[0],
    [buildingPlans, selectedPlanId]
  );
  const activeFloor = useMemo(
    () => activePlan?.floors.find(floor => floor.id === selectedFloorId) || activePlan?.floors[0],
    [activePlan, selectedFloorId]
  );
  const selectedRoom = activeFloor?.rooms.find(room => room.id === selectedRoomId);
  const selectedOpening = activeFloor?.openings.find(opening => opening.id === selectedOpeningId);

  useEffect(() => {
    if (!activePlan && buildingPlans[0]) {
      setSelectedPlanId(buildingPlans[0].id);
      setSelectedFloorId(buildingPlans[0].floors[0]?.id || '');
      return;
    }
    if (activePlan && !activeFloor) {
      setSelectedFloorId(activePlan.floors[0]?.id || '');
    }
  }, [activePlan, activeFloor, buildingPlans]);

  const updatePlans = (updater: (plans: BuildingPlan[]) => BuildingPlan[]) => {
    setBuildingPlans(prev => updater(prev).map(plan =>
      plan.id === selectedPlanId ? { ...plan, updatedAt: new Date().toISOString() } : plan
    ));
  };

  const updateActivePlan = (updater: (plan: BuildingPlan) => BuildingPlan) => {
    if (!activePlan) return;
    updatePlans(plans => plans.map(plan => plan.id === activePlan.id ? updater(plan) : plan));
  };

  const updateActiveFloor = (updater: (floor: BuildingFloor) => BuildingFloor) => {
    if (!activePlan || !activeFloor) return;
    updateActivePlan(plan => ({
      ...plan,
      floors: plan.floors.map(floor => floor.id === activeFloor.id ? updater(floor) : floor),
    }));
  };

  const updateRoom = (roomId: string, patch: Partial<BuildingRoom>) => {
    updateActiveFloor(floor => ({
      ...floor,
      rooms: floor.rooms.map(room => room.id === roomId ? { ...room, ...patch } : room),
    }));
  };

  const handleAddPlan = () => {
    const plan = createPlan();
    setBuildingPlans(prev => [...prev, plan]);
    setSelectedPlanId(plan.id);
    setSelectedFloorId(plan.floors[0].id);
    setSelectedRoomId('');
    setSelectedOpeningId('');
  };

  const handleAddFloor = () => {
    if (!activePlan) return;
    const nextNumber = Math.max(0, ...activePlan.floors.map(floor => floor.number)) + 1;
    const floor = createFloor(nextNumber);
    updateActivePlan(plan => ({ ...plan, floors: [...plan.floors, floor] }));
    setSelectedFloorId(floor.id);
    setSelectedRoomId('');
    setSelectedOpeningId('');
  };

  const handleDeleteRoom = () => {
    if (!selectedRoomId) return;
    updateActiveFloor(floor => ({
      ...floor,
      rooms: floor.rooms.filter(room => room.id !== selectedRoomId),
      openings: floor.openings.filter(opening => opening.roomId !== selectedRoomId),
    }));
    setSelectedRoomId('');
  };

  const handleDeleteOpening = () => {
    if (!selectedOpeningId) return;
    updateActiveFloor(floor => ({
      ...floor,
      openings: floor.openings.filter(opening => opening.id !== selectedOpeningId),
    }));
    setSelectedOpeningId('');
  };

  const getCanvasPoint = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = (canvasRef.current || event.currentTarget).getBoundingClientRect();
    const scaleX = (activeFloor?.width || 1000) / rect.width;
    const scaleY = (activeFloor?.height || 620) / rect.height;
    return {
      x: Math.round((event.clientX - rect.left) * scaleX),
      y: Math.round((event.clientY - rect.top) * scaleY),
    };
  };

  const findRoomAt = (x: number, y: number) =>
    activeFloor?.rooms.find(room => x >= room.x && x <= room.x + room.width && y >= room.y && y <= room.y + room.height);

  const snapRoomPosition = (room: BuildingRoom, x: number, y: number) => {
    if (!activeFloor) return { x, y };
    const edgeTargets = activeFloor.rooms
      .filter(item => item.id !== room.id)
      .flatMap(item => [item.x, item.x + item.width]);
    const verticalTargets = activeFloor.rooms
      .filter(item => item.id !== room.id)
      .flatMap(item => [item.y, item.y + item.height]);

    const snappedX = snapToTargets(snapToTargets(snapToGrid(x), edgeTargets), edgeTargets.map(target => target - room.width));
    const snappedY = snapToTargets(snapToTargets(snapToGrid(y), verticalTargets), verticalTargets.map(target => target - room.height));

    return {
      x: clamp(snappedX, 0, activeFloor.width - room.width),
      y: clamp(snappedY, 0, activeFloor.height - room.height),
    };
  };

  const getOpeningPlacement = (
    kind: BuildingOpeningKind,
    point: { x: number; y: number },
    preferredRoomId?: string
  ): Omit<BuildingOpening, 'id'> | null => {
    if (!activeFloor) return null;
    const candidateRooms = preferredRoomId
      ? activeFloor.rooms.filter(room => room.id === preferredRoomId)
      : activeFloor.rooms;
    if (candidateRooms.length === 0) return null;

    const nearest = candidateRooms
      .flatMap(room => {
        const distances: { room: BuildingRoom; wallSide: BuildingWallSide; distance: number }[] = [
          { room, wallSide: 'top', distance: Math.abs(point.y - room.y) },
          { room, wallSide: 'right', distance: Math.abs(point.x - (room.x + room.width)) },
          { room, wallSide: 'bottom', distance: Math.abs(point.y - (room.y + room.height)) },
          { room, wallSide: 'left', distance: Math.abs(point.x - room.x) },
        ];
        return distances;
      })
      .sort((a, b) => a.distance - b.distance)[0];

    if (!nearest) return null;
    const { room, wallSide } = nearest;
    const length = kind === 'door' ? 42 : 64;
    const thickness = kind === 'door' ? 10 : 8;
    const isHorizontal = wallSide === 'top' || wallSide === 'bottom';

    if (isHorizontal) {
      return {
        kind,
        roomId: room.id,
        wallSide,
        x: clamp(snapToGrid(point.x - length / 2), room.x, room.x + room.width - length),
        y: wallSide === 'top' ? room.y - thickness / 2 : room.y + room.height - thickness / 2,
        width: length,
        height: thickness,
        rotation: 0,
      };
    }

    return {
      kind,
      roomId: room.id,
      wallSide,
      x: wallSide === 'left' ? room.x - thickness / 2 : room.x + room.width - thickness / 2,
      y: clamp(snapToGrid(point.y - length / 2), room.y, room.y + room.height - length),
      width: thickness,
      height: length,
      rotation: 0,
    };
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!activeFloor || dragState) return;
    const point = getCanvasPoint(event);
    if (tool === 'room') {
      const room = createRoom(snapToGrid(point.x), snapToGrid(point.y), classroomTypes[0]?.id || '', departments[0]?.id || '');
      updateActiveFloor(floor => ({ ...floor, rooms: [...floor.rooms, room] }));
      setSelectedRoomId(room.id);
      setSelectedOpeningId('');
      return;
    }
    if (tool === 'door' || tool === 'window') {
      const room = findRoomAt(point.x, point.y);
      const placement = getOpeningPlacement(tool, point, room?.id);
      if (!placement) return;
      const opening = {
        ...createOpening(tool, placement.x, placement.y, placement.roomId, placement.wallSide),
        width: placement.width,
        height: placement.height,
        rotation: placement.rotation,
      };
      updateActiveFloor(floor => ({ ...floor, openings: [...floor.openings, opening] }));
      setSelectedOpeningId(opening.id);
      return;
    }
    if (tool === 'furniture') {
      const room = findRoomAt(point.x, point.y) || selectedRoom;
      if (!room) return;
      const furniture = createFurniture(furnitureKind, snapToGrid(point.x - room.x), snapToGrid(point.y - room.y));
      updateRoom(room.id, { furniture: [...room.furniture, furniture] });
      setSelectedRoomId(room.id);
      setSelectedOpeningId('');
    }
  };

  const handleRoomMouseDown = (event: React.MouseEvent<HTMLDivElement>, room: BuildingRoom) => {
    event.stopPropagation();
    setSelectedRoomId(room.id);
    setSelectedOpeningId('');
    if (tool !== 'select') return;
    const point = getCanvasPoint(event);
    setDragState({ kind: 'room', roomId: room.id, dx: point.x - room.x, dy: point.y - room.y });
  };

  const handleOpeningMouseDown = (event: React.MouseEvent<HTMLDivElement>, opening: BuildingOpening) => {
    event.stopPropagation();
    setSelectedOpeningId(opening.id);
    setSelectedRoomId(opening.roomId || '');
    if (tool !== 'select') return;
    setDragState({ kind: 'opening', openingId: opening.id });
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState || !activeFloor) return;
    const point = getCanvasPoint(event);
    if (dragState.kind === 'room') {
      const room = activeFloor.rooms.find(item => item.id === dragState.roomId);
      if (!room) return;
      updateRoom(room.id, snapRoomPosition(room, point.x - dragState.dx, point.y - dragState.dy));
      return;
    }

    const opening = activeFloor.openings.find(item => item.id === dragState.openingId);
    if (!opening) return;
    const placement = getOpeningPlacement(opening.kind, point, opening.roomId);
    if (!placement) return;
    updateActiveFloor(floor => ({
      ...floor,
      openings: floor.openings.map(item => item.id === opening.id ? { ...item, ...placement } : item),
    }));
  };

  const handleSync = () => {
    if (!activePlan) return;
    const result = syncBuildingPlanRooms(activePlan);
    setSyncMessage(`Создано/обновлено: аудиторий ${result.classrooms}, кабинетов ${result.cabinets}`);
  };

  const stats = activePlan ? {
    floors: activePlan.floors.length,
    rooms: activePlan.floors.reduce((sum, floor) => sum + floor.rooms.length, 0),
    educational: activePlan.floors.reduce((sum, floor) => sum + floor.rooms.filter(room => room.resourceKind === 'classroom').length, 0),
    cabinets: activePlan.floors.reduce((sum, floor) => sum + floor.rooms.filter(room => room.resourceKind === 'cabinet').length, 0),
  } : { floors: 0, rooms: 0, educational: 0, cabinets: 0 };

  if (!activePlan || !activeFloor) {
    return (
      <div className="h-full flex items-center justify-center">
        <button onClick={handleAddPlan} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
          <PlusIcon className="h-5 w-5" />
          Создать план здания
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BuildingOfficeIcon className="h-7 w-7 text-blue-700" />
            План здания
          </h1>
          <div className="mt-1 text-sm text-gray-600">
            Этажей: {stats.floors} · помещений: {stats.rooms} · учебных: {stats.educational} · кабинетов: {stats.cabinets}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleAddPlan} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-800 hover:bg-gray-50">
            <PlusIcon className="h-4 w-4" />
            Корпус
          </button>
          <button onClick={handleAddFloor} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-800 hover:bg-gray-50">
            <PlusIcon className="h-4 w-4" />
            Этаж
          </button>
          <button onClick={handleSync} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">
            <HomeIcon className="h-4 w-4" />
            Создать аудитории и кабинеты
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 min-h-0 flex-1">
        <aside className="col-span-12 xl:col-span-3 space-y-4">
          <section className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-1">Корпус</label>
            <select value={activePlan.id} onChange={event => {
              const plan = buildingPlans.find(item => item.id === event.target.value);
              setSelectedPlanId(event.target.value);
              setSelectedFloorId(plan?.floors[0]?.id || '');
              setSelectedRoomId('');
              setSelectedOpeningId('');
            }} className="w-full p-2 border border-gray-300 rounded-md">
              {buildingPlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
            <input value={activePlan.name} onChange={event => updateActivePlan(plan => ({ ...plan, name: event.target.value }))} className="mt-3 w-full p-2 border border-gray-300 rounded-md" />
            <input value={activePlan.address || ''} onChange={event => updateActivePlan(plan => ({ ...plan, address: event.target.value }))} placeholder="Адрес" className="mt-2 w-full p-2 border border-gray-300 rounded-md" />
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {activePlan.floors.map(floor => (
                <button
                  key={floor.id}
                  onClick={() => { setSelectedFloorId(floor.id); setSelectedRoomId(''); setSelectedOpeningId(''); }}
                  className={`px-3 py-1.5 rounded-md text-sm border ${activeFloor.id === floor.id ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700'}`}
                >
                  {floor.name}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-2">
              {(['select', 'room', 'door', 'window', 'furniture'] as BuildingTool[]).map(item => (
                <button
                  key={item}
                  onClick={() => setTool(item)}
                  className={`px-3 py-2 rounded-md text-sm border ${tool === item ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-300 text-gray-800 hover:bg-gray-50'}`}
                >
                  {item === 'select' ? 'Выбор' : item === 'room' ? 'Комната' : item === 'door' ? 'Дверь' : item === 'window' ? 'Окно' : 'Мебель'}
                </button>
              ))}
            </div>
            {tool === 'furniture' && (
              <select value={furnitureKind} onChange={event => setFurnitureKind(event.target.value as FurnitureKind)} className="mt-3 w-full p-2 border border-gray-300 rounded-md">
                {Object.entries(FURNITURE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            )}
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-3">Привязки</h2>
            <div className="space-y-2 text-sm text-gray-600">
              <div>Комнаты притягиваются к сетке {GRID_SIZE}px и к стенам соседних помещений.</div>
              <div>Двери и окна ставятся только на ближайшую стену комнаты и двигаются вдоль неё.</div>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-3">Помещение</h2>
            {selectedRoom ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input value={selectedRoom.number} onChange={event => updateRoom(selectedRoom.id, { number: event.target.value })} placeholder="Номер" className="p-2 border border-gray-300 rounded-md" />
                  <input type="number" value={selectedRoom.capacity} onChange={event => updateRoom(selectedRoom.id, { capacity: Number(event.target.value) })} className="p-2 border border-gray-300 rounded-md" />
                </div>
                <input value={selectedRoom.name || ''} onChange={event => updateRoom(selectedRoom.id, { name: event.target.value })} placeholder="Название" className="w-full p-2 border border-gray-300 rounded-md" />
                <select value={selectedRoom.resourceKind} onChange={event => updateRoom(selectedRoom.id, { resourceKind: event.target.value as BuildingRoomResourceKind })} className="w-full p-2 border border-gray-300 rounded-md">
                  {Object.entries(RESOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select value={selectedRoom.assignmentCategory} onChange={event => {
                  const category = event.target.value as RoomAssignmentCategory;
                  updateRoom(selectedRoom.id, { assignmentCategory: category, color: ASSIGNMENT_COLORS[category] });
                }} className="w-full p-2 border border-gray-300 rounded-md">
                  {Object.entries(ASSIGNMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input value={selectedRoom.assignmentName || ''} onChange={event => updateRoom(selectedRoom.id, { assignmentName: event.target.value })} placeholder="Назначение" className="w-full p-2 border border-gray-300 rounded-md" />
                {selectedRoom.resourceKind === 'classroom' && (
                  <>
                    <select value={selectedRoom.classroomTypeId || ''} onChange={event => updateRoom(selectedRoom.id, { classroomTypeId: event.target.value })} className="w-full p-2 border border-gray-300 rounded-md">
                      <option value="">Тип аудитории</option>
                      {classroomTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      {classroomTags.map(tag => {
                        const checked = (selectedRoom.tagIds || []).includes(tag.id);
                        return (
                          <label key={tag.id} className={`px-2 py-1.5 rounded-md border text-sm ${checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const current = selectedRoom.tagIds || [];
                                updateRoom(selectedRoom.id, { tagIds: checked ? current.filter(id => id !== tag.id) : [...current, tag.id] });
                              }}
                              className="mr-2"
                            />
                            {tag.name}
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
                {selectedRoom.resourceKind === 'cabinet' && (
                  <select value={selectedRoom.departmentId || ''} onChange={event => updateRoom(selectedRoom.id, { departmentId: event.target.value })} className="w-full p-2 border border-gray-300 rounded-md">
                    <option value="">Подразделение</option>
                    {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </select>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(ASSIGNMENT_COLORS).map(([category, color]) => (
                    <button
                      key={category}
                      onClick={() => updateRoom(selectedRoom.id, { color })}
                      className="h-8 rounded-md border border-gray-300"
                      style={{ backgroundColor: color }}
                      title={ASSIGNMENT_LABELS[category as RoomAssignmentCategory]}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(['x', 'y', 'width', 'height'] as const).map(key => (
                    <input key={key} type="number" value={Math.round(selectedRoom[key])} onChange={event => updateRoom(selectedRoom.id, { [key]: Number(event.target.value) })} className="p-2 border border-gray-300 rounded-md" />
                  ))}
                </div>
                {selectedRoom.furniture.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Мебель</div>
                    {selectedRoom.furniture.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm">
                        <span>{FURNITURE_LABELS[item.kind]}</span>
                        <button
                          onClick={() => updateRoom(selectedRoom.id, { furniture: selectedRoom.furniture.filter(current => current.id !== item.id) })}
                          className="text-red-600 hover:text-red-800"
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={handleDeleteRoom} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
                  <TrashIcon className="h-4 w-4" />
                  Удалить помещение
                </button>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Нет выбранного помещения</div>
            )}
          </section>
          {selectedOpening && (
            <section className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3">{selectedOpening.kind === 'door' ? 'Дверь' : 'Окно'}</h2>
              <div className="space-y-2 text-sm text-gray-600">
                <div>Стена: {selectedOpening.wallSide === 'top' ? 'верхняя' : selectedOpening.wallSide === 'right' ? 'правая' : selectedOpening.wallSide === 'bottom' ? 'нижняя' : 'левая'}</div>
                <div>Комната: {activeFloor.rooms.find(room => room.id === selectedOpening.roomId)?.number || 'не выбрана'}</div>
              </div>
              <button onClick={handleDeleteOpening} className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
                <TrashIcon className="h-4 w-4" />
                Удалить проём
              </button>
            </section>
          )}
        </aside>

        <section className="col-span-12 xl:col-span-9 min-h-0 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <input value={activeFloor.name} onChange={event => updateActiveFloor(floor => ({ ...floor, name: event.target.value }))} className="p-2 border border-gray-300 rounded-md font-medium" />
              <label className="text-sm text-gray-600">№</label>
              <input type="number" value={activeFloor.number} onChange={event => updateActiveFloor(floor => ({ ...floor, number: Number(event.target.value) }))} className="w-20 p-2 border border-gray-300 rounded-md" />
            </div>
            <div className="text-sm text-gray-600">
              В справочниках: аудиторий {classrooms.length}, кабинетов {cabinets.length}
            </div>
          </div>

          <div
            ref={canvasRef}
            className="relative flex-1 min-h-[560px] overflow-hidden rounded-lg border border-gray-300 bg-white shadow-inner"
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={() => setDragState(null)}
            onMouseLeave={() => setDragState(null)}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: 'linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)',
                backgroundSize: '25px 25px',
              }}
            />
            {activeFloor.rooms.map(room => (
              <div
                key={room.id}
                onMouseDown={event => handleRoomMouseDown(event, room)}
                onClick={event => {
                  if (tool === 'select') event.stopPropagation();
                }}
                className={`absolute border-2 rounded-sm shadow-sm overflow-hidden cursor-move ${selectedRoomId === room.id ? 'border-blue-700 ring-2 ring-blue-200' : 'border-gray-700'}`}
                style={{
                  left: `${room.x / activeFloor.width * 100}%`,
                  top: `${room.y / activeFloor.height * 100}%`,
                  width: `${room.width / activeFloor.width * 100}%`,
                  height: `${room.height / activeFloor.height * 100}%`,
                  backgroundColor: room.color,
                }}
              >
                <div className="px-2 py-1 text-xs font-semibold text-gray-900 truncate bg-white/60">
                  {room.number || room.name || RESOURCE_LABELS[room.resourceKind]}
                </div>
                <div className="px-2 text-[11px] text-gray-700 truncate">
                  {ASSIGNMENT_LABELS[room.assignmentCategory]} · {room.capacity} мест
                </div>
                {room.furniture.map(item => (
                  <div
                    key={item.id}
                    className="absolute"
                    style={{
                      left: `${item.x / room.width * 100}%`,
                      top: `${item.y / room.height * 100}%`,
                      width: `${item.width / room.width * 100}%`,
                      height: `${item.height / room.height * 100}%`,
                    }}
                    title={FURNITURE_LABELS[item.kind]}
                  >
                    {renderFurnitureGraphic(item)}
                  </div>
                ))}
              </div>
            ))}
            {activeFloor.openings.map(opening => (
              <div
                key={opening.id}
                onMouseDown={event => handleOpeningMouseDown(event, opening)}
                className={`absolute cursor-move rounded-sm shadow ${opening.kind === 'door' ? 'bg-amber-700' : 'bg-cyan-500'} ${selectedOpeningId === opening.id ? 'ring-2 ring-blue-700 ring-offset-1' : ''}`}
                style={{
                  left: `${opening.x / activeFloor.width * 100}%`,
                  top: `${opening.y / activeFloor.height * 100}%`,
                  width: `${opening.width / activeFloor.width * 100}%`,
                  height: `${opening.height / activeFloor.height * 100}%`,
                  transform: `rotate(${opening.rotation || 0}deg)`,
                }}
                title={opening.kind === 'door' ? 'Дверь' : 'Окно'}
              />
            ))}
          </div>
          {syncMessage && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{syncMessage}</div>}
        </section>
      </div>
    </div>
  );
};

export default BuildingPlanEditor;
