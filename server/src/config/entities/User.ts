import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from "typeorm";
import { Upload } from "./Upload";

@Entity()
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password?: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: "ROLE_USER" })
  role: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Upload, (upload) => upload.user)
  uploads: Upload[];
}
