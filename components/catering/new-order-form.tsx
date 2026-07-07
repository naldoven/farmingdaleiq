"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createOrder } from "@/app/(app)/catering/actions";
import { FULFILLMENT_METHODS } from "@/app/(app)/catering/logic";

export interface MenuItemOption {
  id: string;
  name: string;
}

interface ItemRow {
  menuItemId: string;
  qty: number;
}

/** New-order intake form (ARCHITECTURE.md "Orders"). */
export function NewOrderForm({ menuItems }: { menuItems: MenuItemOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [amount, setAmount] = useState("");
  const [fulfillment, setFulfillment] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paperGoods, setPaperGoods] = useState(false);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);

  function addItemRow() {
    if (menuItems.length === 0) return;
    setItems((rows) => [...rows, { menuItemId: menuItems[0].id, qty: 1 }]);
  }

  function updateItemRow(index: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeItemRow(index: number) {
    setItems((rows) => rows.filter((_, i) => i !== index));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createOrder({
        guestName,
        phone,
        email,
        eventDate,
        eventTime,
        headcount: headcount ? Number(headcount) : undefined,
        amount: amount ? Number(amount) : undefined,
        fulfillment: fulfillment ? (fulfillment as (typeof FULFILLMENT_METHODS)[number]) : undefined,
        deliveryAddress,
        paperGoods,
        notes,
        items,
      });
      if (result.ok) {
        router.push(`/catering/orders/${result.data.orderId}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New catering order</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="guestName">Guest name</Label>
            <Input id="guestName" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="eventDate">Event date</Label>
            <Input
              id="eventDate"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="eventTime">Event time</Label>
            <Input
              id="eventTime"
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="headcount">Headcount</Label>
            <Input
              id="headcount"
              type="number"
              min={0}
              value={headcount}
              onChange={(e) => setHeadcount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="amount">Amount ($)</Label>
            <Input
              id="amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fulfillment">Fulfillment</Label>
            <Select value={fulfillment} onValueChange={setFulfillment}>
              <SelectTrigger id="fulfillment">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {FULFILLMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m === "pickup" ? "Pickup" : "Delivery"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fulfillment === "delivery" && (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="deliveryAddress">Delivery address</Label>
              <Input
                id="deliveryAddress"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="paperGoods"
            checked={paperGoods}
            onCheckedChange={(v) => setPaperGoods(v === true)}
          />
          <Label htmlFor="paperGoods">Paper goods needed</Label>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Menu items</Label>
            <Button type="button" variant="outline" size="sm" onClick={addItemRow}>
              Add item
            </Button>
          </div>
          {items.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Select
                value={row.menuItemId}
                onValueChange={(v) => updateItemRow(index, { menuItemId: v })}
              >
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
                value={row.qty}
                onChange={(e) => updateItemRow(index, { qty: Number(e.target.value) || 1 })}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => removeItemRow(index)}>
                Remove
              </Button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">No items added yet.</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="button"
          disabled={isPending || !guestName.trim() || !eventDate}
          onClick={submit}
        >
          {isPending ? "Creating..." : "Create order"}
        </Button>
      </CardContent>
    </Card>
  );
}
