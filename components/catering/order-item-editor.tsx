"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addOrderItem, removeOrderItem, updateOrderItemQty } from "@/app/(app)/catering/actions";

export interface OrderItemRow {
  id: string;
  menuItemId: string;
  menuItemName: string;
  qty: number;
}

export interface MenuItemOption {
  id: string;
  name: string;
}

/** Order detail's line-item table: edit quantities, add/remove menu items. */
export function OrderItemEditor({
  orderId,
  items,
  menuItems,
}: {
  orderId: string;
  items: OrderItemRow[];
  menuItems: MenuItemOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newMenuItemId, setNewMenuItemId] = useState(menuItems[0]?.id ?? "");
  const [newQty, setNewQty] = useState(1);

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.menuItemName}</TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={1}
                  className="h-8 w-20"
                  defaultValue={item.qty}
                  disabled={isPending}
                  onBlur={(e) => {
                    const qty = Number(e.target.value) || 1;
                    if (qty === item.qty) return;
                    startTransition(async () => {
                      await updateOrderItemQty({ id: item.id, qty });
                      router.refresh();
                    });
                  }}
                />
              </TableCell>
              <TableCell>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      await removeOrderItem({ id: item.id });
                      router.refresh();
                    });
                  }}
                >
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No items on this order.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {menuItems.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={newMenuItemId} onValueChange={setNewMenuItemId}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {menuItems.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            className="w-20"
            value={newQty}
            onChange={(e) => setNewQty(Number(e.target.value) || 1)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || !newMenuItemId}
            onClick={() => {
              startTransition(async () => {
                await addOrderItem({ orderId, menuItemId: newMenuItemId, qty: newQty });
                setNewQty(1);
                router.refresh();
              });
            }}
          >
            Add item
          </Button>
        </div>
      )}
    </div>
  );
}
