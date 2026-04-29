export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      asistencia_diaria: {
        Row: {
          ausentes: number
          created_at: string
          date: string
          id: string
          part_id: string | null
          plantilla_total: number
          presentes: number
          user_id: string
          zona_id: string | null
        }
        Insert: {
          ausentes?: number
          created_at?: string
          date: string
          id?: string
          part_id?: string | null
          plantilla_total?: number
          presentes?: number
          user_id: string
          zona_id?: string | null
        }
        Update: {
          ausentes?: number
          created_at?: string
          date?: string
          id?: string
          part_id?: string | null
          plantilla_total?: number
          presentes?: number
          user_id?: string
          zona_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asistencia_diaria_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "partes_diarios"
            referencedColumns: ["id"]
          },
        ]
      }
      box_azules: {
        Row: {
          created_at: string
          date: string | null
          id: string
          kg_podrido: number
          kg_reciclado: number
          notes: string | null
          part_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string | null
          id?: string
          kg_podrido?: number
          kg_reciclado?: number
          notes?: string | null
          part_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string | null
          id?: string
          kg_podrido?: number
          kg_reciclado?: number
          notes?: string | null
          part_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "box_azules_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "partes_diarios"
            referencedColumns: ["id"]
          },
        ]
      }
      costes_diarios: {
        Row: {
          cantidad: number
          coste_unitario: number
          created_at: string
          date: string
          id: string
          part_id: string | null
          tipo: string | null
          unidad: string | null
          user_id: string
          zona_id: string | null
        }
        Insert: {
          cantidad?: number
          coste_unitario?: number
          created_at?: string
          date: string
          id?: string
          part_id?: string | null
          tipo?: string | null
          unidad?: string | null
          user_id: string
          zona_id?: string | null
        }
        Update: {
          cantidad?: number
          coste_unitario?: number
          created_at?: string
          date?: string
          id?: string
          part_id?: string | null
          tipo?: string | null
          unidad?: string | null
          user_id?: string
          zona_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costes_diarios_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "partes_diarios"
            referencedColumns: ["id"]
          },
        ]
      }
      gstock_entries: {
        Row: {
          created_at: string
          date: string | null
          id: string
          kg_expected: number
          part_id: string
          product: string | null
          size_range: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string | null
          id?: string
          kg_expected?: number
          part_id: string
          product?: string | null
          size_range?: string | null
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string | null
          id?: string
          kg_expected?: number
          part_id?: string
          product?: string | null
          size_range?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gstock_entries_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "partes_diarios"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes_dia: {
        Row: {
          created_at: string
          id: string
          lote_codigo: string | null
          notas: string | null
          part_id: string
          producto: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lote_codigo?: string | null
          notas?: string | null
          part_id: string
          producto?: string | null
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lote_codigo?: string | null
          notas?: string | null
          part_id?: string
          producto?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_dia_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "partes_diarios"
            referencedColumns: ["id"]
          },
        ]
      }
      partes_archivos: {
        Row: {
          file_name: string | null
          file_path: string | null
          file_size: number | null
          file_type: Database["public"]["Enums"]["archivo_tipo"] | null
          id: string
          mime_type: string | null
          part_id: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: Database["public"]["Enums"]["archivo_tipo"] | null
          id?: string
          mime_type?: string | null
          part_id: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: Database["public"]["Enums"]["archivo_tipo"] | null
          id?: string
          mime_type?: string | null
          part_id?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partes_archivos_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "partes_diarios"
            referencedColumns: ["id"]
          },
        ]
      }
      partes_diarios: {
        Row: {
          created_at: string
          date: string
          estado: Database["public"]["Enums"]["parte_estado"]
          id: string
          kg_industria_manual: number
          kg_inventario_anterior_sin_alta: number
          kg_inventario_final: number
          kg_inventario_sin_alta: number
          kg_mujeres_calibrador: number
          kg_mujeres_manual: number
          kg_palets_brutos: number
          kg_palets_pendientes_anterior: number
          kg_podrido_bolsa_basura: number
          kg_podrido_calibrador_auto: number
          kg_podrido_calibrador_manual: number
          kg_podrido_manual: number
          kg_produccion_calibrador: number
          kg_reciclado_malla_z1: number
          kg_reciclado_malla_z2: number
          kg_reciclado_manual: number
          notas_generales: string | null
          notas_inventario: string | null
          resumen_ia: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          estado?: Database["public"]["Enums"]["parte_estado"]
          id?: string
          kg_industria_manual?: number
          kg_inventario_anterior_sin_alta?: number
          kg_inventario_final?: number
          kg_inventario_sin_alta?: number
          kg_mujeres_calibrador?: number
          kg_mujeres_manual?: number
          kg_palets_brutos?: number
          kg_palets_pendientes_anterior?: number
          kg_podrido_bolsa_basura?: number
          kg_podrido_calibrador_auto?: number
          kg_podrido_calibrador_manual?: number
          kg_podrido_manual?: number
          kg_produccion_calibrador?: number
          kg_reciclado_malla_z1?: number
          kg_reciclado_malla_z2?: number
          kg_reciclado_manual?: number
          notas_generales?: string | null
          notas_inventario?: string | null
          resumen_ia?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          estado?: Database["public"]["Enums"]["parte_estado"]
          id?: string
          kg_industria_manual?: number
          kg_inventario_anterior_sin_alta?: number
          kg_inventario_final?: number
          kg_inventario_sin_alta?: number
          kg_mujeres_calibrador?: number
          kg_mujeres_manual?: number
          kg_palets_brutos?: number
          kg_palets_pendientes_anterior?: number
          kg_podrido_bolsa_basura?: number
          kg_podrido_calibrador_auto?: number
          kg_podrido_calibrador_manual?: number
          kg_podrido_manual?: number
          kg_produccion_calibrador?: number
          kg_reciclado_malla_z1?: number
          kg_reciclado_malla_z2?: number
          kg_reciclado_manual?: number
          notas_generales?: string | null
          notas_inventario?: string | null
          resumen_ia?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      production_runs: {
        Row: {
          created_at: string
          date: string | null
          destination: string | null
          id: string
          kg_produced: number
          part_id: string
          product: string | null
          size_range: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string | null
          destination?: string | null
          id?: string
          kg_produced?: number
          part_id: string
          product?: string | null
          size_range?: string | null
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string | null
          destination?: string | null
          id?: string
          kg_produced?: number
          part_id?: string
          product?: string | null
          size_range?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_runs_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "partes_diarios"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "operario" | "admin"
      archivo_tipo: "GSTOCK" | "Produccion" | "BoxAzules" | "FotoLotes" | "Otro"
      parte_estado: "Borrador" | "Analizado" | "Con descuadre" | "Validado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["operario", "admin"],
      archivo_tipo: ["GSTOCK", "Produccion", "BoxAzules", "FotoLotes", "Otro"],
      parte_estado: ["Borrador", "Analizado", "Con descuadre", "Validado"],
    },
  },
} as const
