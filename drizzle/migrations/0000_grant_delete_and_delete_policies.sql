-- Allow the app role to issue DELETE on store-scoped tables (RLS still decides who).
GRANT DELETE ON public.stock_movements, public.purchase_items, public.products,
  public.waybills, public.payslips, public.customers, public.finance_records,
  public.suppliers, public.supplier_payments, public.tasks, public.sales_forms,
  public.faulty_stocks, public.agent_stocks, public.payroll_periods,
  public.purchases, public.purchase_orders, public.purchase_order_items,
  public.businesses, public.call_orders, public.agents, public.orders,
  public.order_items, public.receipts, public.invoices, public.refunds,
  public.commissions, public.goals, public.message_templates,
  public.order_call_attempts, public.notifications
  TO authenticated;
GRANT ALL ON public.stock_movements, public.purchase_items TO service_role;

-- Missing DELETE policies (admins only)
CREATE POLICY "admins delete stock_movements" ON public.stock_movements
  FOR DELETE TO authenticated
  USING (public.is_store_admin(auth.uid(), store_id));

CREATE POLICY "admins delete purchase_items" ON public.purchase_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.id = purchase_items.purchase_id
      AND public.is_store_admin(auth.uid(), p.store_id)
  ));
