"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
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
import { updateOrderDetails } from "@/app/(app)/catering/actions";
import { FULFILLMENT_METHODS } from "@/app/(app)/catering/logic";

export interface OrderDetailsData {
  id: string;
  guestName: string;
  phone: string | null;
  email: string | null;
  eventDate: string;
  eventTime: string | null;
  headcount: number | null;
  amount: number | null;
  fulfillment: string | null;
  deliveryAddress: string | null;
  paperGoods: boolean;
  notes: string | null;
}

/** Editable order fields (ARCHITECTURE.md "Orders"). */
export function OrderDetailsForm({ order }: { order: OrderDetailsData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState(order.guestName);
  const [phone, setPhone] = useState(order.phone ?? "");
  const [email, setEmail] = useState(order.email ?? "");
  const [eventDate, setEventDate] = useState(order.eventDate);
  const [eventTime, setEventTime] = useState(order.eventTime ?? "");
  const [headcount, setHeadcount] = useState(order.headcount?.toString() ?? "");
  const [amount, setAmount] = useState(order.amount?.toString() ?? "");
  const [fulfillment, setFulfillment] = useState(order.fulfillment ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(order.deliveryAddress ?? "");
  const [paperGoods, setPaperGoods] = useState(order.paperGoods);
  const [notes, setNotes] = useState(order.notes ?? "");

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateOrderDetails({
        id: order.id,
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
      });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="d-guestName">Guest name</Label>
          <Input id="d-guestName" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="d-phone">Phone</Label>
          <Input id="d-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="d-email">Email</Label>
          <Input id="d-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="d-eventDate">Event date</Label>
          <Input id="d-eventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="d-eventTime">Event time</Label>
          <Input id="d-eventTime" type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="d-headcount">Headcount</Label>
          <Input
            id="d-headcount"
            type="number"
            min={0}
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="d-amount">Amount ($)</Label>
          <Input
            id="d-amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="d-fulfillment">Fulfillment</Label>
          <Select value={fulfillment} onValueChange={setFulfillment}>
            <SelectTrigger id="d-fulfillment">
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
            <Label htmlFor="d-deliveryAddress">Delivery address</Label>
            <Input
              id="d-deliveryAddress"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="d-paperGoods"
          checked={paperGoods}
          onCheckedChange={(v) => setPaperGoods(v === true)}
        />
        <Label htmlFor="d-paperGoods">Paper goods needed</Label>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="d-notes">Notes</Label>
        <Textarea id="d-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="button" disabled={isPending} onClick={submit} className="self-start">
        {isPending ? "Saving..." : "Save details"}
      </Button>
    </div>
  );
}
